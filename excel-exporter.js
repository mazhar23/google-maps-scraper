import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';

export async function writeLeadsToExcel({ leads, outputPath }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Leads');

  const headers = [
    'lead_id',
    'business_name',
    'category',
    'address',
    'city',
    'state',
    'zip_code',
    'phone',
    'website',
    'rating',
    'review_count',
    'emails',
    'additional_phones',
    'business_hours',
    'facebook',
    'twitter',
    'linkedin',
    'instagram',
    'youtube',
    'tiktok',
    'owner_name',
    'owner_title',
    'owner_email',
    'owner_phone',
    'owner_linkedin',
    'team_contacts',
    'has_website',
    'website_status',
    'website_score',
    'website_grade',
    'outdated_signals',
    'tech_stack',
    'https',
    'has_robots',
    'has_sitemap',
    'mobile_friendly',
    'load_speed_rating',
    'source_url',
    'scraped_at',
    'search_query',
    'pages_scraped',
    'enrichment_status',
  ];

  const dataRows = (leads || []).map((lead, idx) => {
    const audit = lead.website_audit || {};
    const contacts = lead.contacts || {};
    const social = contacts.social || {};
    const team = contacts.team_contacts || [];
    return {
      lead_id: lead.lead_id || String(idx + 1),
      business_name: lead.business_name || '',
      category: lead.category || '',
      address: lead.address || '',
      city: lead.city || '',
      state: lead.state || '',
      zip_code: lead.zip_code || '',
      phone: lead.phone || '',
      website: lead.website || '',
      rating: lead.rating ?? '',
      review_count: lead.review_count ?? '',
      emails: Array.isArray(contacts.emails) ? contacts.emails.join('; ') : '',
      additional_phones: Array.isArray(contacts.additional_phones) ? contacts.additional_phones.join('; ') : '',
      business_hours: contacts.business_hours || '',
      facebook: social.facebook || '',
      twitter: social.twitter || '',
      linkedin: social.linkedin || '',
      instagram: social.instagram || '',
      youtube: social.youtube || '',
      tiktok: social.tiktok || '',
      owner_name: contacts.owner_name || '',
      owner_title: contacts.owner_title || '',
      owner_email: contacts.owner_email || '',
      owner_phone: contacts.owner_phone || '',
      owner_linkedin: contacts.owner_linkedin || '',
      team_contacts: JSON.stringify(team),
      has_website: Boolean(audit.has_website),
      website_status: audit.website_status || '',
      website_score: audit.website_score ?? '',
      website_grade: audit.website_grade || '',
      outdated_signals: String(audit.outdated_signals || []).slice(0, 255),
      tech_stack: String(audit.tech_stack || []).slice(0, 255),
      https: audit.https ?? '',
      has_robots: audit.has_robots ?? '',
      has_sitemap: audit.has_sitemap ?? '',
      mobile_friendly: audit.mobile_friendly ?? '',
      load_speed_rating: audit.load_speed_rating || '',
      source_url: lead.source_url || '',
      scraped_at: lead.scraped_at || new Date().toISOString(),
      search_query: lead.search_query || '',
      pages_scraped: lead.pages_scraped ?? '',
      enrichment_status: lead.enrichment_status || 'done',
    };
  });

  sheet.columns = headers.map(h => ({ header: h.toUpperCase().replace(/_/g, ' '), key: h, width: 22 }));
  dataRows.forEach(row => sheet.addRow(row));

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}
