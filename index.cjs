const R = require('ramda');
const axios = require('axios');
const { execSync } = require('child_process');
const readline = require('readline');
require('dotenv').config();

const apiKey = process.env.OPEN_API_KEY_COMMIT;
const apiUrl = 'https://api.openai.com/v1/chat/completions';

// Sanitize sensitive information from the diff
const sanitizeDiff = diff => diff
  .replace(/(API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY)=.+/g, 'REDACTED')
  .replace(/(\/\*.*?\*\/|\/\/.*?$)/gm, '') // Remove comments
  .replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, 'VAR'); // Anonymize variable names

// Get the list of changed files
const getChangedFiles = () => {
  try {
    return R.pipe(
      () => execSync('git diff --cached --name-only', { encoding: 'utf-8' }),
      R.split('\n'),
      R.filter(file => file && !file.includes('.min.') && file.trim() !== ''),
      R.filter(file => !file.includes('config')),
      R.filter(file => file.endsWith('.js') || file.endsWith('.ts')) // Restrict to safe file types
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
const generateCommitMessage = async diff => {
  // TODO: support another model like deepseek R1
  const payload = {
    model: 'gpt-4o-mini',
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
    const response = await axios.post(apiUrl, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    return R.pathOr('Default commit message.', ['data', 'choices', 0, 'message', 'content'], response).trim();
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

// Prompt user for confirmation before sending diff
const confirmSend = diff => {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Do you want to send this diff to OpenAI? (yes/no): ', answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
};

// Main function to coordinate the process
const main = async () => {
  const changedFiles = getChangedFiles();

  if (R.isEmpty(changedFiles)) {
    console.log('No changes to commit.');
    return;
  }

  const diff = getGitDiff(changedFiles);
  const confirmed = await confirmSend(diff);

  if (confirmed) {
    const commitMessage = await generateCommitMessage(diff);
    console.log(commitMessage);
  } else {
    console.log('Operation canceled.');
  }
};

main();

