const R = require('ramda');
const axios = require('axios');
const { execSync } = require('child_process');
require('dotenv').config();

const apiKey = process.env.OPEN_API_KEY_COMMIT;
const apiUrl = 'https://api.openai.com/v1/chat/completions';

const sanitizeDiff = diff => diff.replace(/(API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY)=.+/g, 'REDACTED');

const getChangedFiles = () => {
  try {
    return R.pipe(
      () => execSync('git diff --cached --name-only', { encoding: 'utf-8' }),
      R.split('\n'),
      R.filter(file => file && !file.includes('.min.') && file.trim() !== ''),
      R.filter(file => file.endsWith('.js') || file.endsWith('.ts')),
    )();
  } catch (error) {
    console.error('Error fetching changed files:', error);
    return [];
  }
};

const getGitDiff = R.pipe(
  R.map(file => {
    try {
      return execSync(`git diff --cached -- "${file}"`, { encoding: 'utf-8' });
    } catch (error) {
      console.error(`Error getting diff for file ${file}:`, error);
      return '';
    }
  }),
  R.join('\n'),
  sanitizeDiff
);

const generateCommitMessage = async diff => {
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

    return R.pathOr('This is default commit message due to field lost.', ['data', 'choices', 0, 'message', 'content'], response).trim();
  } catch (error) {
    const err = error.response?.data || error.message
    console.error('Error generating commit message:', err);
    return err;
  }
};

const main = async () => {
  const changedFiles = getChangedFiles();

  if (R.isEmpty(changedFiles)) {
    console.log('No changes to commit.')
    return 
  } 
  
  return generateCommitMessage(getGitDiff(changedFiles)).then(console.log);
};

main();
