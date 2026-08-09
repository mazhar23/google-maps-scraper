import path from 'path';
import { runPipeline } from './pipeline.js';
import { printFunnel } from './crm.js';
import { sendProposal } from './email-sender.js';
import { getLeadById, getLastJob } from './db.js';

const ALL_US_STATES = [
  { state: 'AL', name: 'Alabama' }, { state: 'AK', name: 'Alaska' },
  { state: 'AZ', name: 'Arizona' }, { state: 'AR', name: 'Arkansas' },
  { state: 'CA', name: 'California' }, { state: 'CO', name: 'Colorado' },
  { state: 'CT', name: 'Connecticut' }, { state: 'DE', name: 'Delaware' },
  { state: 'FL', name: 'Florida' }, { state: 'GA', name: 'Georgia' },
  { state: 'HI', name: 'Hawaii' }, { state: 'ID', name: 'Idaho' },
  { state: 'IL', name: 'Illinois' }, { state: 'IN', name: 'Indiana' },
  { state: 'IA', name: 'Iowa' }, { state: 'KS', name: 'Kansas' },
  { state: 'KY', name: 'Kentucky' }, { state: 'LA', name: 'Louisiana' },
  { state: 'ME', name: 'Maine' }, { state: 'MD', name: 'Maryland' },
  { state: 'MA', name: 'Massachusetts' }, { state: 'MI', name: 'Michigan' },
  { state: 'MN', name: 'Minnesota' }, { state: 'MS', name: 'Mississippi' },
  { state: 'MO', name: 'Missouri' }, { state: 'MT', name: 'Montana' },
  { state: 'NE', name: 'Nebraska' }, { state: 'NV', name: 'Nevada' },
  { state: 'NH', name: 'New Hampshire' }, { state: 'NJ', name: 'New Jersey' },
  { state: 'NM', name: 'New Mexico' }, { state: 'NY', name: 'New York' },
  { state: 'NC', name: 'North Carolina' }, { state: 'ND', name: 'North Dakota' },
  { state: 'OH', name: 'Ohio' }, { state: 'OK', name: 'Oklahoma' },
  { state: 'OR', name: 'Oregon' }, { state: 'PA', name: 'Pennsylvania' },
  { state: 'RI', name: 'Rhode Island' }, { state: 'SC', name: 'South Carolina' },
  { state: 'SD', name: 'South Dakota' }, { state: 'TN', name: 'Tennessee' },
  { state: 'TX', name: 'Texas' }, { state: 'UT', name: 'Utah' },
  { state: 'VT', name: 'Vermont' }, { state: 'VA', name: 'Virginia' },
  { state: 'WA', name: 'Washington' }, { state: 'WV', name: 'West Virginia' },
  { state: 'WI', name: 'Wisconsin' }, { state: 'WY', name: 'Wyoming' },
  { state: 'DC', name: 'District of Columbia' },
  { state: 'PR', name: 'Puerto Rico' }, { state: 'GU', name: 'Guam' },
  { state: 'VI', name: 'U.S. Virgin Islands' },
  { state: 'AS', name: 'American Samoa' }, { state: 'MP', name: 'Northern Mariana Islands' },
];

const stateMap = Object.fromEntries(ALL_US_STATES.map(s => [s.state, s.name]));

const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  const eq = args.find(a => a.startsWith(`${flag}=`));
  return eq ? eq.split('=')[1] : null;
}

function hasArg(flag) {
  return args.includes(flag) || args.some(a => a.startsWith(`${flag}=`));
}

(async () => {
  if (hasArg('--status')) {
    printFunnel();
    process.exit(0);
  }

  const proposeLeadId = getArg('--propose');
  if (proposeLeadId) {
    try {
      console.log(`Generating and sending proposal for lead: ${proposeLeadId}`);
      const result = await sendProposal(proposeLeadId);
      console.log('Success:', result);
      process.exit(0);
    } catch (err) {
      console.error('Failed to send proposal:', err.message);
      process.exit(1);
    }
  }

  const statesFlag = getArg('--states') || getArg('--state') || 'NY';
  const states = statesFlag.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const resolvedStates = states.map(s => {
    if (stateMap[s]) return { code: s, name: stateMap[s] };
    const match = ALL_US_STATES.find(x => x.name.toLowerCase() === s.toLowerCase());
    if (match) return { code: match.state, name: match.name };
    return { code: s, name: s };
  });

  const isResume = hasArg('--resume');
  let jobId = undefined;
  let params = {};

  if (isResume) {
    const lastJob = getLastJob('full');
    if (!lastJob) {
      console.error('No previous job found to resume.');
      process.exit(1);
    }
    console.log(`Resuming job ${lastJob.job_id} from stage: ${lastJob.current_stage || 'start'}`);
    jobId = lastJob.job_id;
    const config = JSON.parse(lastJob.config || '{}');
    params = { ...config, stage: lastJob.current_stage || 'full', jobId };
  } else {
    params = {
      query: getArg('--query') || 'local services',
      city: getArg('--city') || '',
      states: resolvedStates,
      limit: Number(getArg('--limit') || '50'),
      workers: Number(getArg('--workers') || '3'),
      inputFile: getArg('--input-file'),
      outputFile: getArg('--output') || path.join(process.cwd(), 'output', `leads-${Date.now()}.xlsx`),
      stage: getArg('--stage') || 'full',
    };
  }

  if (resolvedStates.length === 0 && !isResume && !params.inputFile) {
    console.error(`Error: No valid states provided. Use --states flag with comma-separated state codes or names.`);
    process.exit(1);
  }

  try {
    const result = await runPipeline(params);
    console.log(JSON.stringify({ outputPath: result.outputPath, leadCount: result.leads.length, jobId: result.jobId }, null, 2));
    printFunnel();
  } catch (err) {
    console.error('Pipeline failed:', err.message);
    process.exitCode = 1;
  }
})();
