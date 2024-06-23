module.exports = {
    apps: [
        {
            name: 'dorry.ai',
            script: 'npm',
            args: 'run start',
            watch: true,
            autorestart: true,
            max_restarts: 10,
            env: {
                NODE_ENV: 'production'
            },
        },
    ],
};