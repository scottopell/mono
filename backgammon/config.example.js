// Copy this file to `config.js` and fill in your TURN server credentials.
// `config.js` is gitignored so credentials never land in the public repo.
// If you skip this file entirely, the app runs STUN-only (works on most
// home networks, but some symmetric-NAT mobile networks will fail to
// connect peer-to-peer).
window.BACKGAMMON_CONFIG = {
  turn: {
    urls: [
      'turn:turn.yourdomain.com:5349?transport=tcp',
      'turn:turn.yourdomain.com:3478',
    ],
    username: 'your-turn-user',
    credential: 'your-turn-password',
  },
};
