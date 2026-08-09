import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { searchGoogleMaps, enrichMapsListing } from './google-maps-scraper.js';
import { auditWebsite } from './website-auditor.js';
import { extractContactsFromWebsite } from './contact-enricher.js';
import { writeLeadsToExcel } from './excel-exporter.js';
import {
  getDb,
  upsertLead,
  updateLeadScore,
  getLeadsByStatus,
  createJob,
  updateJobProgress,
  completeJob,
  failJob,
  getTopLeads,
  getAllLeads
} from './db.js';
import { scoreLead } from './lead-scorer.js';
import { advanceLead } from './crm.js';
import { checkImapReplies } from './reply-detector.js';

export async function runPipeline({
  query = 'local services',
  city = '',
  states = [{ code: 'NY', name: 'New York' }],
  limit = 50,
  workers = 3,
  inputFile,
  outputFile,
  stage = 'full', // 'full', 'scrape', 'enrich', 'score', 'export'
  jobId = uuidv4()
}) {
  console.log(`[pipeline] Starting job ${jobId} (stage: ${stage})`);
  createJob(jobId, 'full', { query, city, states, limit, stage });

  try {
    let leads = [];

    // STAGE: SCRAPE
    if (['full', 'scrape'].includes(stage)) {
      updateJobProgress(jobId, 'scrape', 0, limit);
      leads = await runScrapeStage({ query, city, states, limit, inputFile });
      // Insert raw leads into DB
      for (const lead of leads) {
        upsertLead(lead);
      }
      updateJobProgress(jobId, 'scrape', leads.length, limit);
    } else {
      // If skipping scrape, load existing leads from DB
      leads = getLeadsByStatus('new', limit);
      if (leads.length === 0) leads = getAllLeads(limit);
    }

    // STAGE: ENRICH
    if (['full', 'enrich'].includes(stage)) {
      updateJobProgress(jobId, 'enrich', 0, leads.length);
      const enrichedLeads = [];
      const seen = new Set();
      
      for (let i = 0; i < leads.length; i++) {
        const listing = leads[i];
        if (enrichedLeads.length >= limit) break;
        
        try {
          const base = await enrichMapsListing(listing);
          const key = `${base.business_name}|${base.address || base.website}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const audit = base.website ? await auditWebsite(base.website) : await auditWebsite('');
          const contacts = await extractContactsFromWebsite({
            website: base.website,
            businessName: base.business_name,
          });

          const enriched = {
            lead_id: listing.lead_id || uuidv4(),
            ...base,
            category: base.category || listing.raw?.category || listing.raw?.query || query,
            contacts,
            website_audit: audit,
            scraped_at: new Date().toISOString(),
            search_query: listing.search_query || `${query} in ${city}`,
            pages_scraped: base.website ? 1 : 0,
            enrichment_status: 'success',
          };
          
          upsertLead(enriched);
          enrichedLeads.push(enriched);
          updateJobProgress(jobId, 'enrich', i + 1, leads.length);
        } catch (err) {
          console.error(`[pipeline] Enrich error for ${listing.name || listing.business_name}:`, err.message);
        }
      }
      leads = enrichedLeads;
    }

    // STAGE: SCORE
    if (['full', 'score'].includes(stage)) {
      updateJobProgress(jobId, 'score', 0, leads.length);
      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const scoreData = scoreLead(lead);
        updateLeadScore(lead.lead_id, scoreData);
        updateJobProgress(jobId, 'score', i + 1, leads.length);
      }
    }

    // STAGE: REPLIES (check for replies if running full pipeline)
    if (['full', 'replies'].includes(stage)) {
      updateJobProgress(jobId, 'replies', 0, 1);
      await checkImapReplies();
      updateJobProgress(jobId, 'replies', 1, 1);
    }

    // EXPORT
    const finalLeads = getAllLeads(limit);
    const outPath = outputFile || path.join(process.cwd(), 'output', `leads-${Date.now()}.xlsx`);
    await writeLeadsToExcel({ leads: finalLeads, outputPath: outPath });
    
    completeJob(jobId);
    console.log(`[pipeline] Job ${jobId} completed. Exported to ${outPath}`);
    return { leads: finalLeads, outputPath: outPath, jobId };
    
  } catch (err) {
    console.error(`[pipeline] Job ${jobId} failed:`, err);
    failJob(jobId, err.message);
    throw err;
  }
}

async function runScrapeStage({ query, city, states, limit, inputFile }) {
  let listings = [];
  if (inputFile) {
    const raw = await fs.readFile(inputFile, 'utf8');
    const parsed = JSON.parse(raw);
    listings = Array.isArray(parsed) ? parsed : parsed.leads || parsed.items || [];
  } else {
    const stateList = Array.isArray(states) ? states : [{ code: String(states).toUpperCase(), name: String(states) }];
    for (const st of stateList) {
      const stateCode = st.code || st.state || String(st);
      const stateName = st.name || st.state || stateCode;
      const targetCity = city || '';
      const perStateLimit = Math.ceil(limit / stateList.length) + 10;
      const searchResults = await searchGoogleMaps({ query, limit: perStateLimit, city: targetCity, state: stateCode });
      for (const sr of searchResults) {
        sr._stateCode = stateCode;
        sr._stateName = stateName;
      }
      listings.push(...searchResults);
    }
  }

  return listings.map(l => ({
    lead_id: l.lead_id || uuidv4(),
    business_name: String(l.name || l.business_name || '').split('\n')[0].trim(),
    source_url: l.source_url || l.href || l.website || '',
    search_query: l.query || `${query} in ${city}`,
    state: l._stateCode || '',
    raw_data: l,
  }));
}