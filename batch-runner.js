import { runPipeline } from './pipeline.js';
import { printFunnel } from './crm.js';

const args = process.argv.slice(2);
const input = args[0];
const limit = Number(args[1] || '50');
const output = args[2] || `output/batch-${Date.now()}.xlsx`;

if (!input && !process.argv.includes('--resume')) {
  console.error('Usage: node batch-runner.js <input.json> [limit] [output.xlsx] OR node batch-runner.js --resume');
  process.exit(1);
}

(async () => {
  try {
    let params = { inputFile: input, limit, outputFile: output };
    
    // Support resume in batch mode too
    if (process.argv.includes('--resume')) {
      const { getLastJob } = await import('./db.js');
      const lastJob = getLastJob('full');
      if (!lastJob) {
        console.error('No previous job found to resume.');
        process.exit(1);
      }
      console.log(`Resuming batch job ${lastJob.job_id}`);
      params = { ...JSON.parse(lastJob.config || '{}'), stage: lastJob.current_stage || 'full', jobId: lastJob.job_id };
    }

    const result = await runPipeline(params);
    console.log(JSON.stringify({ outputPath: result.outputPath, leadCount: result.leads.length }, null, 2));
    printFunnel();
  } catch (err) {
    console.error('Batch run failed:', err.message);
    process.exitCode = 1;
  }
})();
