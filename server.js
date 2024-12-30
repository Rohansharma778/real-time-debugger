const express = require('express');
const http = require('http');
const path = require('path');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const session = require('express-session');
const { Server } = require('socket.io');
const ACTIONS = require('./src/Action');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Add session middleware
app.use(session({
    secret: 'your-session-secret',
    resave: false,
    saveUninitialized: true,
}));

app.use(express.json()); // Add JSON body parser

const CLIENT_ID = "7736976184540-onsmmd93m8qqg3qc2ggic7nbi7hkoai1.apps.googleusercontent.com";
const CLIENT_SECRET ="7GOCSPX-lZoEbpdN_yv4itNbGzuPq-k7sHb2";
const REDIRECT_URI = 'http://localhost:5000/oauth2callback';
const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Initialize Google Calendar API
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// Create a new Google Meet meeting
app.post('/api/create-meeting', async (req, res) => {
    try {
        const { summary, description, startTime, duration } = req.body;
        
        // Ensure user is authenticated
        if (!req.session.tokens) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        oauth2Client.setCredentials(req.session.tokens);

        // Calculate end time
        const endTime = new Date(new Date(startTime).getTime() + duration * 60000);

        const event = {
            summary: summary || 'Code Collaboration Meeting',
            description: description || 'Meeting for real-time code collaboration',
            start: {
                dateTime: new Date(startTime).toISOString(),
                timeZone: 'UTC',
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: 'UTC',
            },
            conferenceData: {
                createRequest: {
                    requestId: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
                    conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
            },
        };

        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            conferenceDataVersion: 1,
        });

        // Extract meeting details
        const meetingDetails = {
            id: response.data.id,
            meetingLink: response.data.hangoutLink,
            startTime: response.data.start.dateTime,
            endTime: response.data.end.dateTime,
        };

        res.json(meetingDetails);
    } catch (error) {
        console.error('Error creating meeting:', error);
        res.status(500).json({ error: 'Failed to create meeting' });
    }
});

// Get meeting details
app.get('/api/meeting/:meetingId', async (req, res) => {
    try {
        if (!req.session.tokens) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        oauth2Client.setCredentials(req.session.tokens);
        
        const response = await calendar.events.get({
            calendarId: 'primary',
            eventId: req.params.meetingId,
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error fetching meeting:', error);
        res.status(500).json({ error: 'Failed to fetch meeting details' });
    }
});

// Update existing OAuth routes
app.get('/auth/google', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events',
        ],
    });
    res.redirect(authUrl);
});
// Add the OAuth2 callback route RIGHT HERE
app.get('/oauth2callback', async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        req.session.tokens = tokens;
        res.redirect('/'); // Redirect to your frontend
    } catch (error) {
        console.error('Error getting tokens:', error);
        res.status(500).send('Authentication failed');
    }
});
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
// Rest of your existing code remains the same...