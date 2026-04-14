require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('.'));

const API_KEY = process.env.API_KEY;
const API_URL = 'https://elmodels.ngrok.app/v1/chat/completions';

app.post('/api/chat', async (req, res) => {
    try {
        console.log('📥 طلب جديد');
        const { messages } = req.body;
        
        const response = await axios.post(API_URL, {
            model: 'nuha-2.0',
            messages: messages,
            max_tokens: 1000,
            temperature: 0.7
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            }
        });
        
        console.log('✅ نجح');
        res.json(response.data);
        
    } catch (error) {
        console.error('❌ خطأ:', error.message);
        res.status(500).json({ 
            error: 'خطأ في الاتصال',
            details: error.response?.data || error.message
        });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log('✅ السيرفر شغال: http://localhost:' + PORT);
});
