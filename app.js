const express = require("express");
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require("path");
const multer = require('multer');
const mongoose = require('mongoose');
const dotenv = require('dotenv').config();
const { body, validationResult } = require('express-validator');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const app = express();

// Middleware to parse JSON and form data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); // Serve static files from 'public' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve uploaded files

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  store: MongoStore.create({ mongoUrl: process.env.DB_URL }),
  cookie: { secure: false } // Set to true if using HTTPS
}));


// Middleware to set user object for views
app.use((req, res, next) => {
  res.locals.user = req.session.user; // Make user object available in views
  next();
});

app.set("views", path.resolve(__dirname, "views"));
app.set("view engine", "ejs");

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

// Connect to MongoDB
mongoose.connect(process.env.DB_URL)
  .then(() => console.log('Connected to MongoDB'))
  .catch(error => console.error('Error connecting to MongoDB:', error));

// Schemas and Models
const foodSchema = new mongoose.Schema({
  title: String,
  image: String,
  location: String,
  latitude: String,
  longitude: String,
  description: String,
  username: { type: String, required: true } // Added username field
});
const Food = mongoose.model('Food', foodSchema);

const houseSchema = new mongoose.Schema({
  title: String,
  image: String,
  location: String,
  rent: Number,
  latitude: String,
  longitude: String,
  description: String,
  username: { type: String, required: true } // Added username field
});
const House = mongoose.model('House', houseSchema);

const marketSchema = new mongoose.Schema({
  title: String,
  image: String,
  location: String,
  price: Number,
  latitude: String,
  longitude: String,
  description: String,
  username: { type: String, required: true } // Added username field
});
const Market = mongoose.model('Market', marketSchema);

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// Authentication middleware
const ensureAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  res.redirect('/auth?action=login');
};

// Routes

// Home route
app.get('/', (req, res) => {
  res.render('index', {
    searchAction: '/food', // URL to handle the search
    selectedType: req.query.type || 'food', // Default type
    query: req.query.query || '', // Default query
    activeLink: 'home'
  });
});

// Render authentication page
app.get('/login', (req, res) => {
  const action = req.query.action || 'login'; // Default to 'login' if no action is provided
  res.render('auth', { action, errors: [], activeLink: ''});
});


// Render authentication page
app.get('/auth', (req, res) => {
  const action = req.query.action || 'login'; // Default to 'login' if no action is provided
  res.render('auth', { action, errors: [], activeLink: ''});
});

// Handle login form submission
app.post('/login', [
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('auth', { action: 'login', errors: errors.array(), activeLink: ''});
  }

  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
      req.session.user = user;
      res.redirect('/');
    } else {
      res.status(400).render('auth', { action: 'login', errors: [{ msg: 'Invalid credentials' }], activeLink: '' });
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).render('500');
  }
});

// Handle signup form submission
app.post('/signup', [
  body('username').notEmpty().withMessage('Username is required'),
  body('email').isEmail().withMessage('Email is required and must be valid'),
  body('password').notEmpty().withMessage('Password is required'),
  body('confirmPassword').notEmpty().withMessage('Confirm Password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('auth', { action: 'signup', errors: errors.array(), activeLink: ''});
  }

  const { username, email, password, confirmPassword } = req.body;
  
  // Check if passwords match
  if (password !== confirmPassword) {
    return res.status(400).render('auth', { action: 'signup', errors: [{ msg: 'Passwords do not match' }], activeLink: ''});
  }

  try {
    // Check if username or email already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      const errors = [];
      if (existingUser.username === username) {
        errors.push({ msg: 'Username is already taken' });
      }
      if (existingUser.email === email) {
        errors.push({ msg: 'Email is already registered' });
      }
      return res.status(400).render('auth', { action: 'signup', errors, activeLink: '' });
    }

    // Hash the password and create a new user
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();
    
    // Log the user in and redirect to home
    req.session.user = newUser;
    res.redirect('/');
  } catch (error) {
    console.error('Error during signup:', error);
    res.status(500).render('auth', { action: 'signup', errors: [{ msg: 'Internal Server Error' }], activeLink: '' });
  }
});

// Handle logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error during logout:', err);
      res.status(500).render('500');
    } else {
      res.redirect('/');
    }
  });
});

// Render form pages with authentication check
app.get('/food/form', ensureAuthenticated, (req, res) => {
  res.render('form', { routeName: 'food', errors: [], activeLink: 'food'});
});

app.get('/house/form', ensureAuthenticated, (req, res) => {
  res.render('form', { routeName: 'house', errors: [] ,activeLink: 'house'});
});

app.get('/market/form', ensureAuthenticated, (req, res) => {
  res.render('form', { routeName: 'market', errors: [], activeLink: 'market'});
});

// Handle search and display for houses
app.get('/house', async (req, res) => {
  try {
    const domain = req.get('host');
    const query = req.query.query || ''; // Retrieve the query from the request
    const searchRegex = new RegExp(query, 'i'); // Create a regex for case-insensitive search

    // Find all items if no query is provided, otherwise filter based on the query
    const houses = await House.find({
      $or: [
        { title: searchRegex },
        { location: searchRegex },
        { description: searchRegex }
      ]
    });

    res.render('display', { cards: houses, domain, imagepath: "/house.jpg", query, selectedType: 'house', searchAction: '/house', activeLink: 'house'});
  } catch (error) {
    console.error('Error fetching houses:', error);
    res.status(500).render('500');
  }
});

// Handle form submission for houses
app.post('/house', upload.single('image'), [
  body('title').notEmpty().withMessage('Title is required'),
  body('location').notEmpty().withMessage('Location is required'),
  body('rent').isFloat().withMessage('Rent must be a valid number'),
  body('latitude').isFloat().withMessage('Latitude must be a valid number'),
  body('longitude').isFloat().withMessage('Longitude must be a valid number'),
  body('description').notEmpty().withMessage('Description is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('form', { errors: errors.array(), routeName: 'house' , activeLink: 'house'});
  }
  
  try {
    const { title, location, rent, latitude, longitude, description } = req.body;
    const image = req.file ? 'uploads/' + req.file.filename : '';
    const username = req.session.user.username; // Get the username from session
    const newHouse = new House({ title, image, location, rent, latitude, longitude, description, username });
    await newHouse.save();
    res.redirect('/house');
  } catch (error) {
    console.error('Error saving House:', error);
    res.status(500).render('500');
  }
});

// Handle search and display for markets
app.get('/market', async (req, res) => {
  try {
    const domain = req.get('host');
    const query = req.query.query || ''; // Retrieve the query from the request
    const searchRegex = new RegExp(query, 'i'); // Create a regex for case-insensitive search

    // Find all items if no query is provided, otherwise filter based on the query
    const markets = await Market.find({
      $or: [
        { title: searchRegex },
        { location: searchRegex },
        { description: searchRegex }
      ]
    });

    res.render('display', { cards: markets, domain, imagepath: "/market.jpg", query, selectedType: 'market', searchAction: '/market', activeLink: 'market'});
  } catch (error) {
    console.error('Error fetching markets:', error);
    res.status(500).render('500');
  }
});

// Handle form submission for markets
app.post('/market', upload.single('image'), [
  body('title').notEmpty().withMessage('Title is required'),
  body('location').notEmpty().withMessage('Location is required'),
  body('price').isFloat().withMessage('Price must be a valid number'),
  body('latitude').isFloat().withMessage('Latitude must be a valid number'),
  body('longitude').isFloat().withMessage('Longitude must be a valid number'),
  body('description').notEmpty().withMessage('Description is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('form', { errors: errors.array(), routeName: 'market' , activeLink: 'market'});
  }
  
  try {
    const { title, location, price, latitude, longitude, description } = req.body;
    const image = req.file ? 'uploads/' + req.file.filename : '';
    const username = req.session.user.username; // Get the username from session
    const newMarket = new Market({ title, image, location, price, latitude, longitude, description, username });
    await newMarket.save();
    res.redirect('/market');
  } catch (error) {
    console.error('Error saving Market:', error);
    res.status(500).render('500');
  }
});

// Handle search and display for foods
app.get('/food', async (req, res) => {
  try {
    const domain = req.get('host');
    const query = req.query.query || ''; // Retrieve the query from the request
    const searchRegex = new RegExp(query, 'i'); // Create a regex for case-insensitive search

    // Find all items if no query is provided, otherwise filter based on the query
    const foods = await Food.find({
      $or: [
        { title: searchRegex },
        { location: searchRegex },
        { description: searchRegex }
      ]
    });

    res.render('display', { cards: foods, domain, imagepath: "/food.jpg", query, selectedType: 'food', searchAction: '/food', activeLink: 'food'});
  } catch (error) {
    console.error('Error fetching foods:', error);
    res.status(500).render('500');
  }
});

// Handle form submission for foods
app.post('/food', upload.single('image'), [
  body('title').notEmpty().withMessage('Title is required'),
  body('location').notEmpty().withMessage('Location is required'),
  body('latitude').isFloat().withMessage('Latitude must be a valid number'),
  body('longitude').isFloat().withMessage('Longitude must be a valid number'),
  body('description').notEmpty().withMessage('Description is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('form', { errors: errors.array(), routeName: 'food', activeLink: 'food'});
  }
  
  try {
    const { title, location, latitude, longitude, description } = req.body;
    const image = req.file ? 'uploads/' + req.file.filename : '';
    const username = req.session.user.username; // Get the username from session
    const newFood = new Food({ title, image, location, latitude, longitude, description, username });
    await newFood.save();
    res.redirect('/food');
  } catch (error) {
    console.error('Error saving Food:', error);
    res.status(500).render('500');
  }
});


app.post('/delete/:type/:id', ensureAuthenticated, async (req, res) => {
  const { type, id } = req.params;
  const { username } = req.session.user;

  try {
    let Model;
    let item;

    switch (type) {
      case 'food':
        Model = Food;
        break;
      case 'house':
        Model = House;
        break;
      case 'market':
        Model = Market;
        break;
      default:
        res.status(500).render('500');
    }

    // Find the item to delete
    item = await Model.findOne({ _id: id });
    if (!item) {
      res.status(500).render('500');
    }

    // Check if the user is "admin" or owns the item
    if (username === "admin" || item.username === username) {
      // If there's a file associated with the item, delete it
      if (item.image) {
        const fileToDelete = path.join(__dirname, item.image);
        fs.unlink(fileToDelete, (err) => {
          if (err) {
            console.error(`Error deleting file: ${err}`);
          }
        });
      }

      // Delete the item from the database
      await Model.deleteOne({ _id: id });
      return res.redirect(`/${type}`);
    } else {
      res.status(500).render('500');
    }
  } catch (error) {
    console.error(`Error deleting ${type}:`, error);
    res.status(500).render('500');
  }
});

app.get("/500", (req, res) => {
  res.status(500).render('500');
});


// 404 handler
app.use((req, res) => {
  res.status(404).render('404');
});

// Start server
app.listen(8080, () => {
  console.log('Server listening on port 8080...');
});
