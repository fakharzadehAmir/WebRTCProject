import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
    cors: {
        origin: '*',
    },
})

const users = new Map()


io.on('connection', (socket) => {

    socket.on('chat-message', (message) => {
        console.log(`Chat message from ${socket.id}: ${message}`);
        socket.broadcast.emit('chat-message', message, socket.id); 
    });

    socket.on('offer', (offer, targetSocketId) => {
        io.to(targetSocketId).emit('offer', offer, socket.id);
    });

    socket.on('answer', (answer, targetSocketId) => {
        io.to(targetSocketId).emit('answer', answer, socket.id);
    });

    socket.on('ice-candidate', (iceCandidate, targetSocketId) => {
        io.to(targetSocketId).emit('ice-candidate', iceCandidate, socket.id);
    });

    socket.on('join-call', () => {
        socket.broadcast.emit('user-connected', socket.id);
    });

    socket.on('disconnect', () => {
        socket.broadcast.emit('user-disconnected', socket.id);
    });
});


const port = 8000

httpServer.listen(port, () => {
    console.log(`server on port ${port}`)
})