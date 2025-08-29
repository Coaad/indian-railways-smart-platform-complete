# 🚀 Deployment Guide - Indian Railways Smart Platform

## Quick Start (5 Minutes)

1. **Extract & Navigate**
   ```bash
   cd indian-railways-smart-platform
   ```

2. **Backend Setup**
   ```bash
   cd server
   npm install
   cp .env.example .env
   # Edit .env with your MongoDB URI and JWT secret
   npm run dev
   ```

3. **Frontend Setup** (New Terminal)
   ```bash
   cd client
   npm install
   cp .env.example .env
   npm run dev
   ```

4. **Access Application**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:5000

## Production Deployment

### Environment Variables (Required)
```bash
# Server
JWT_SECRET=your-64-character-secret
MONGO_URI=mongodb://your-database-url
PORT=5000

# Client  
REACT_APP_API_URL=https://your-api-domain.com/api
```

### Deployment Options

1. **Vercel + Railway** (Recommended)
2. **Netlify + Heroku**
3. **AWS/GCP/Azure**
4. **Traditional VPS**

## Features to Showcase

- 🔐 Enterprise Security Implementation
- ⚡ Real-Time Crowd Monitoring
- 🎫 QR-Based Digital Ticketing
- 🆘 Emergency SOS System
- 📱 Progressive Web App
- ♿ Accessibility Features
- 🌐 Multi-Language Support

Ready to impress! 🌟
