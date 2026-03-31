const express = require('express');
const router = express.Router();
const SupportTicket = require('../models/SupportTicket');
const { authenticate, isAdmin } = require('../middlewares/auth');

router.post('/submit', async (req, res) => {
    try {
        const { name, email, subject, message, userId } = req.body;

        if (!name || !email || !subject || !message) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }

        const newTicket = new SupportTicket({
            name,
            email,
            subject,
            message,
            user: userId || null
        });

        await newTicket.save();
        res.status(201).json({ message: 'Ticket de soporte enviado correctamente' });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo procesar el ticket de soporte', details: err.message });
    }
});

router.get('/all', authenticate, isAdmin, async (req, res) => {
    try {
        const tickets = await SupportTicket.find().sort({ createdAt: -1 }).populate('user', 'username email');
        res.status(200).json(tickets);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener tickets de soporte' });
    }
});

router.patch('/:id/status', authenticate, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const ticket = await SupportTicket.findByIdAndUpdate(id, { status }, { new: true });
        res.status(200).json(ticket);
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar estado del ticket' });
    }
});

// Admin Route: Delete a ticket
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await SupportTicket.findByIdAndDelete(id);
        res.status(200).json({ message: 'Ticket eliminado' });
    } catch (err) {
        res.status(500).json({ error: 'Fallo al eliminar ticket' });
    }
});

module.exports = router;
