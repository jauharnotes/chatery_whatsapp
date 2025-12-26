const express = require('express');
const router = express.Router();
const askController = require('../controllers/ask.controller');

router.post('/ask', askController.askQuestion);

// Internal/Admin route for ingesting (protected by nothing effectively here, just MVP)
router.post('/documents', askController.ingestDocument);
router.post('/image', askController.generateImage);

module.exports = router;
