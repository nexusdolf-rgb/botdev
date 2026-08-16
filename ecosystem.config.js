// Configuration PM2 pour l'hébergement 24/7
// Usage : pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'botdev',
      script: 'server/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // REGISTRATION_CLOSED: '1',  // Décommente une fois ton compte créé
      },
      max_memory_restart: '512M',
      autorestart: true,
    },
  ],
};
