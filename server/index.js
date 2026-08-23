import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3001;
const API_HOST = process.env.API_HOST || '127.0.0.1';
const app = createApp();

app.listen(PORT, API_HOST, () => {
  console.log(`WorldHistory API listening on http://${API_HOST}:${PORT}`);
});
