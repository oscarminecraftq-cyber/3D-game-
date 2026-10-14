const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Configure Socket.io with CORS enabled for frontend hosting (like Netlify)
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Serve static files from the 'public' folder
app.use(express.static('public'));

// Game state tracking
const players = {};
const accounts = {};

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Handle player login / joining the arena
    socket.on('login', (username) => {
        if (!accounts[username]) {
            accounts[username] = { username, coins: 100, trophies: 0 };
        }
        socket.username = username;

        players[socket.id] = {
            id: socket.id,
            username: username,
            x: (Math.random() - 0.5) * 15,
            z: (Math.random() - 0.5) * 15,
            hp: 100,
            maxHp: 100,
            coins: accounts[username].coins,
            trophies: accounts[username].trophies,
            color: '#' + Math.floor(Math.random() * 16777215).toString(16)
        };

        // Send initial setup data to the newly joined player
        socket.emit('initData', { 
            playerData: players[socket.id], 
            leaderboard: getLeaderboard() 
        });

        // Broadcast updated player list to everyone
        io.emit('updatePlayers', players);
    });

    // Handle real-time movement updates
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x += data.dx;
            players[socket.id].z += data.dz;
            io.emit('updatePlayers', players);
        }
    });

    // Handle shooting / attacks
    socket.on('shoot', (targetData) => {
        const p = players[socket.id];
        if (!p) return;
        
        // Broadcast bullet action to all clients
        io.emit('bulletFired', { 
            ownerId: socket.id, 
            x: p.x, 
            z: p.z, 
            targetX: targetData.x, 
            targetZ: targetData.z 
        });
    });

    // Handle player hits and damage scoring
    socket.on('playerHit', ({ victimId, damage }) => {
        const victim = players[victimId];
        const attacker = players[socket.id];

        if (victim && attacker) {
            victim.hp -= damage;

            if (victim.hp <= 0) {
                // Reward attacker
                attacker.coins += 20;
                attacker.trophies += 10;
                accounts[attacker.username].coins = attacker.coins;
                accounts[attacker.username].trophies = attacker.trophies;
                
                // Respawn victim
                victim.hp = victim.maxHp;
                victim.x = (Math.random() - 0.5) * 15;
                victim.z = (Math.random() - 0.5) * 15;

                // Update leaderboard globally
                io.emit('updateLeaderboard', getLeaderboard());
            }

            io.emit('updatePlayers', players);
        }
    });

    // Handle player disconnections
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete players[socket.id];
        io.emit('updatePlayers', players);
    });
});

// Helper function to generate the top 10 leaderboard
function getLeaderboard() {
    return Object.values(accounts)
        .sort((a, b) => b.trophies - a.trophies)
        .slice(0, 10);
}

// Bind to environment port (required for cloud hosts like Render) or default to 3000 locally
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 3D Brawl Server running on port ${PORT}`);
});