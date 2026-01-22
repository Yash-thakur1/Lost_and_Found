# Campus Lost & Found Website 🔍

A comprehensive web application for college students to report and find lost items on campus.

## 🌟 Features

### Core Features
- **User Authentication**: Secure registration and login system
- **Item Reporting**: Report lost or found items with detailed descriptions
- **Image Upload**: Upload photos of items
- **Search & Filter**: Advanced filtering by category, status, and location
- **Claiming System**: Users can claim items they believe belong to them
- **Notifications**: Real-time notifications for claims, matches, and updates
- **Admin Panel**: Comprehensive admin dashboard for managing users and items
- **Activity Feed**: View recent activity across the platform
- **Statistics Dashboard**: Track items, success rates, and user engagement

### New Features ✨
- **Reward System**: Users can offer rewards for lost items to incentivize returns
  - Add reward amount when reporting a lost item
  - Display reward badges on item cards
  - Show reward information in item details

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Yash-thakur1/Lost_and_Found.git
cd Lost_and_Found
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## 📁 Project Structure

```
Lost_and_Found/
├── backend/
│   ├── routes/          # API routes
│   ├── middleware/      # Auth and upload middleware
│   ├── uploads/         # Uploaded images
│   ├── database.js      # Database setup
│   ├── server.js        # Express server
│   └── package.json     # Backend dependencies
├── index.html           # Main application page
├── admin.html           # Admin dashboard
├── script.js            # Main JavaScript file
├── admin.js             # Admin panel logic
├── api.js               # API client
├── styles.css           # Main stylesheet
├── admin.css            # Admin panel styles
├── FEATURES.md          # Detailed features documentation
└── README.md            # This file
```

## 🎮 Usage

### For Students

1. **Register/Login**: Create an account with your campus email
2. **Report Lost Item**: 
   - Click "Report Item"
   - Select "I Lost Something"
   - Fill in details (name, category, location, date, description)
   - Optionally add a reward amount
   - Upload a photo (optional)
   - Submit

3. **Report Found Item**:
   - Click "Report Item"
   - Select "I Found Something"
   - Fill in details
   - Submit

4. **Browse Items**: 
   - Use filters to narrow down results
   - Click on items to view details
   - Claim items that belong to you

5. **Manage Claims**:
   - View your reported items
   - Approve or reject claims on your items

### For Administrators

1. Navigate to `/admin.html`
2. Login with admin credentials
3. Manage users, items, and claims
4. View system statistics
5. Handle contact messages

## 🔧 Configuration

### Database
The application uses SQLite for data storage. The database file is created automatically at:
```
backend/database.sqlite
```

### Environment Variables
You can configure the following (optional):
```bash
PORT=3000  # Server port (default: 3000)
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Items
- `GET /api/items` - Get all items (with filters)
- `GET /api/items/:id` - Get single item
- `POST /api/items` - Create new item (requires auth)
- `PUT /api/items/:id` - Update item (requires auth)
- `DELETE /api/items/:id` - Delete item (requires auth)
- `POST /api/items/:id/claim` - Claim an item (requires auth)

### Notifications
- `GET /api/notifications` - Get user notifications (requires auth)
- `PUT /api/notifications/:id/read` - Mark notification as read (requires auth)
- `PUT /api/notifications/read-all` - Mark all as read (requires auth)

### Stats
- `GET /api/stats/overview` - Get platform statistics
- `GET /api/stats/activity` - Get recent activity

## 🎨 Customization

### Categories
Edit the categories in `script.js`:
```javascript
const categoryIcons = {
    electronics: 'fa-laptop',
    accessories: 'fa-glasses',
    documents: 'fa-file-alt',
    // Add more categories
};
```

### Locations
Edit the campus locations in `script.js`:
```javascript
const locationNames = {
    library: 'Library',
    cafeteria: 'Cafeteria',
    // Add more locations
};
```

## 🔒 Security Features

- Password hashing with bcrypt
- JWT-based authentication
- Protected API routes
- Input validation and sanitization
- SQL injection prevention
- CORS enabled

## 🤝 Contributing

We welcome contributions! Here are some ways you can help:

1. Report bugs
2. Suggest new features
3. Improve documentation
4. Submit pull requests

## 📝 Future Enhancements

See [FEATURES.md](FEATURES.md) for a comprehensive list of planned features:
- Email notifications
- QR code generation
- Real-time chat
- Mobile app
- AI-powered matching
- And many more!

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Font Awesome for icons
- Google Fonts for typography
- All contributors and testers

## 📧 Contact

For questions or support, please use the contact form in the application or open an issue on GitHub.

---

**Made with ❤️ for college students**
