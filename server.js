const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const connectDB = require('./config/db');

const rawItemsRouter = require('./routes/rawItems');
const menuItemsRouter = require('./routes/menuItems');
const recipesRouter = require('./routes/recipes');
const sessionsRouter = require('./routes/sessions');

const app = express();

// Connect to MongoDB
connectDB();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/raw-items', rawItemsRouter);
app.use('/api/menu-items', menuItemsRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/sessions', sessionsRouter);

// Basic Health Check Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
