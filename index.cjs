const R = require('ramda');
const axios = require('axios');
const { execSync } = require('child_process');
const readline = require('readline');
const chalk = require('chalk');

require('dotenv').config();

const USE_LOCAL_MODEL = process.env.USE_LOCAL_MODEL === 'true';
const OPEN_AI_KEY_FOR_COMMIT = process.env.OPEN_AI_KEY_FOR_COMMIT;
const OPEN_AI_MODEL = process.env.OPEN_AI_MODEL || 'gpt-4o-mini';
const LOCAL_MODEL_NAME = process.env.LOCAL_MODEL_NAME || 'deepseek-r1';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'; // https://api.openai.com/v1/chat/completions
const LOCAL_MODEL_API_URL = 'http://localhost:11434/api/chat'; // ollama

// Colorize the diff for better readability of logs
const colorizeDiff = diff => {
  return diff.split('\n').map(line => {
    if (line.startsWith('+')) {
      return chalk.green(line); 
    } else if (line.startsWith('-')) {
      return chalk.red(line); 
    }
    return line;
  }).join('\n');
};

// Sanitize sensitive information from the diff
const sanitizeDiff = diff => diff
  .replace(/(API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY)=.+/g, 'REDACTED')
  .replace(/(\/\*.*?\*\/|\/\/.*?$)/gm, '') // Remove comments

// Get the list of changed files
const getChangedFiles = () => {
  try {
    return R.pipe(
      () => execSync('git diff --cached --name-only', { encoding: 'utf-8' }),
      R.split('\n'),
      R.filter(file => file && !file.includes('.min.') && file.trim() !== ''),
      R.filter(file => !file.includes('config')),
      // R.filter(file => file.endsWith('js') || file.endsWith('ts')) // Restrict to safe file types
    )();
  } catch (error) {
    console.error('Error fetching changed files:', error);
    return [];
  }
};

// Get the git diff for the changed files
const getGitDiff = R.pipe(
  R.map(file => {
    try {
      const sanitizedFile = file.replace(/[^a-zA-Z0-9._-]/g, ''); // Sanitize file names
      return execSync(`git diff --cached -- "${sanitizedFile}"`, { encoding: 'utf-8' });
    } catch (error) {
      console.error(`Error getting diff for file ${file}:`, error);
      return '';
    }
  }),
  R.join('\n'),
  sanitizeDiff // Sanitize the diff before sending it to OpenAI
);

// Generate a commit message using OpenAI
const generateCommitMessageFromOpenAIAPI = async diff => {
  const payload = {
    model: OPEN_AI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are an excellent developer responsible for writing concise and descriptive Git commit messages.',
      },
      {
        role: 'user',
        content: `Based on the following git diff, generate a meaningful commit message in English. Include two parts:\n1. Summary (no more than 50 characters)\n2. Description (bullet points describing the changes):\n${diff}`,
      },
    ],
  };

  try {
    const result = await axios.post(OPENAI_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${OPEN_AI_KEY_FOR_COMMIT}`,
        'Content-Type': 'application/json',
      },
    });

    return R.pathOr('Default commit message.', ['data', 'choices', 0, 'message', 'content'], result).trim();
  } catch (error) {
    const err = error.response?.data || error.message;
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error generating commit message:', err);
    } else {
      console.error('An error occurred while generating the commit message.');
    }
    return 'Refactor code.';
  }
};

const generateCommitMessageFromLocalModel = async diff => {
  const payload = JSON.stringify({
    model: LOCAL_MODEL_NAME,
    messages: [
      {
        role: 'system',
        content: 'You are an AI specialized in generating concise Git commit messages. Respond ONLY with the commit message, without explanations or additional context.',
      },      
      {
        role: 'user',
        content: `Generate a concise Git commit message based on the following git diff. Strictly follow this format:\n\nSummary: <no more than 50 characters>\n\nDescription:\n- Bullet point 1\n- Bullet point 2\n\nDo NOT include explanations, thoughts, or additional context. Only provide the formatted commit message.\n\nGit diff:\n${diff}`,
      }
    ],
    temperature: 0.2,
    top_p: 0.9,
    stream: false
  });

  try {
    const result = await axios.post(LOCAL_MODEL_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    console.log(result, 'result from local model'); // TODO: remove this
    return R.pathOr('Default commit message.', ['data', 'message', 'content'], result).trim();
  } catch (error) {
    console.error('Local model error:', error);
    return 'Error summarizing with local model.';
  }
};

// Prompt user for confirmation before sending diff
const confirmSend = diff => {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log(chalk.yellow('Show diff: ----------------------------'));
    console.log(colorizeDiff(diff));
    console.log(chalk.yellow('Show diff end. ----------------------------'));

    rl.question('Do you want to send this diff to AI? (yes/no): ', answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
};

// Main function to coordinate the process
const main = async () => {
  const changedFiles = getChangedFiles();

  if (R.isEmpty(changedFiles)) {
    console.log('No changedFiles to commit.');
    return;
  }

  const diff = getGitDiff(changedFiles);
  const confirmed = await confirmSend(diff);

  if (confirmed) {
    if (USE_LOCAL_MODEL) {
      try {
        console.log('Using local DeepSeek R1 model...');
        return await generateCommitMessageFromLocalModel(diff);
      } catch (error) {
        console.error('Local model error:', error);
        return 'Error summarizing with local model.';
      }
    } else {
      console.log(`Using OpenAI API ${OPEN_AI_MODEL}...`);
      if (!OPEN_AI_KEY_FOR_COMMIT) {
        console.error('OPEN_AI_KEY_FOR_COMMIT is not set.');
        return 'OPEN_AI_KEY_FOR_COMMIT is not set.';
      }
      return await generateCommitMessageFromOpenAIAPI(diff);
    }
  } else {
    console.log('Operation canceled.');
    return 'Operation canceled.';
  }
};

main();

