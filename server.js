require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const connectDB = require('./config/db');

const rawItemsRouter = require('./routes/rawItems');
const menuItemsRouter = require('./routes/menuItems');
const recipesRouter = require('./routes/recipes');
const sessionsRouter = require('./routes/sessions');
const adminRouter = require('./routes/admin');
const managerRouter = require('./routes/manager');
const { router: authRouter, hashPassword } = require('./routes/auth');
const User = require('./models/User');
const Restaurant = require('./models/Restaurant');
const RawItem = require('./models/RawItem');
const MenuItem = require('./models/MenuItem');
const Recipe = require('./models/Recipe');
const InventorySession = require('./models/InventorySession');

const app = express();

// Connect to MongoDB
connectDB();

// Seed default users and migrate legacy records if necessary
const seedDefaultUsers = async () => {
  try {
    // 1. Ensure default restaurant exists
    let defaultRest = await Restaurant.findOne({ name: "Chuck's Kitchen" });
    if (!defaultRest) {
      defaultRest = new Restaurant({
        name: "Chuck's Kitchen",
        approved: true
      });
      await defaultRest.save();
      console.log("Seeded default restaurant: Chuck's Kitchen");
    }

    // 2. Ensure default users exist
    const adminUser = await User.findOne({ username: 'admin' });
    if (!adminUser) {
      await User.create({ username: 'admin', password: hashPassword('admin123'), role: 'admin', approved: true });
      console.log('Seeded admin user');
    } else {
      if (adminUser.approved === undefined) {
        adminUser.approved = true;
        await adminUser.save();
      }
    }

    const managerUser = await User.findOne({ username: 'manager' });
    if (!managerUser) {
      await User.create({
        username: 'manager',
        password: hashPassword('manager123'),
        role: 'manager',
        approved: true,
        restaurants: [defaultRest._id]
      });
      console.log('Seeded manager user');
    } else {
      let updated = false;
      if (managerUser.approved === undefined) {
        managerUser.approved = true;
        updated = true;
      }
      if (!managerUser.restaurants || managerUser.restaurants.length === 0) {
        managerUser.restaurants = [defaultRest._id];
        updated = true;
      }
      if (updated) await managerUser.save();
    }

    const staffUser = await User.findOne({ username: 'staff' });
    if (!staffUser) {
      await User.create({
        username: 'staff',
        password: hashPassword('staff123'),
        role: 'staff',
        approved: true,
        restaurants: [defaultRest._id]
      });
      console.log('Seeded staff user');
    } else {
      let updated = false;
      if (staffUser.approved === undefined) {
        staffUser.approved = true;
        updated = true;
      }
      if (!staffUser.restaurants || staffUser.restaurants.length === 0) {
        staffUser.restaurants = [defaultRest._id];
        updated = true;
      }
      if (updated) await staffUser.save();
    }

    // Seed devarsh.2023@gmail.com user as manager of Chuck's Kitchen
    let devarshUser = await User.findOne({ username: 'devarsh.2023@gmail.com' });
    if (!devarshUser) {
      await User.create({
        username: 'devarsh.2023@gmail.com',
        password: hashPassword('manager123'),
        role: 'manager',
        approved: true,
        restaurants: [defaultRest._id]
      });
      console.log("Seeded devarsh.2023@gmail.com user linked to Chuck's Kitchen.");
    } else {
      let updated = false;
      if (devarshUser.role !== 'manager') {
        devarshUser.role = 'manager';
        updated = true;
      }
      if (!devarshUser.approved) {
        devarshUser.approved = true;
        updated = true;
      }
      if (!devarshUser.restaurants || !devarshUser.restaurants.includes(defaultRest._id)) {
        if (!devarshUser.restaurants) devarshUser.restaurants = [];
        devarshUser.restaurants.push(defaultRest._id);
        updated = true;
      }
      if (updated) {
        await devarshUser.save();
        console.log("Updated devarsh.2023@gmail.com user to manager, approved and assigned Chuck's Kitchen.");
      }
    }

    // Seed monildumasia@gmail.com user as admin
    let monilUser = await User.findOne({ username: 'monildumasia@gmail.com' });
    if (!monilUser) {
      await User.create({
        username: 'monildumasia@gmail.com',
        password: hashPassword('Monil2026!'),
        role: 'admin',
        approved: true
      });
      console.log("Seeded monildumasia@gmail.com admin user.");
    } else {
      let updated = false;
      if (monilUser.role !== 'admin') {
        monilUser.role = 'admin';
        updated = true;
      }
      if (!monilUser.approved) {
        monilUser.approved = true;
        updated = true;
      }
      const hashedPass = hashPassword('Monil2026!');
      if (monilUser.password !== hashedPass) {
        monilUser.password = hashedPass;
        updated = true;
      }
      if (updated) {
        await monilUser.save();
        console.log("Updated monildumasia@gmail.com user to admin and approved.");
      }
    }

    // 3. Migrate existing unassociated documents
    const rawItemResult = await RawItem.updateMany(
      { restaurant: { $exists: false } },
      { $set: { restaurant: defaultRest._id } }
    );
    if (rawItemResult.modifiedCount > 0) {
      console.log(`Migrated ${rawItemResult.modifiedCount} raw items to default restaurant.`);
    }

    const menuItemResult = await MenuItem.updateMany(
      { restaurant: { $exists: false } },
      { $set: { restaurant: defaultRest._id } }
    );
    if (menuItemResult.modifiedCount > 0) {
      console.log(`Migrated ${menuItemResult.modifiedCount} menu items to default restaurant.`);
    }

    const recipeResult = await Recipe.updateMany(
      { restaurant: { $exists: false } },
      { $set: { restaurant: defaultRest._id } }
    );
    if (recipeResult.modifiedCount > 0) {
      console.log(`Migrated ${recipeResult.modifiedCount} recipes to default restaurant.`);
    }

    const sessionResult = await InventorySession.updateMany(
      { restaurant: { $exists: false } },
      { $set: { restaurant: defaultRest._id } }
    );
    if (sessionResult.modifiedCount > 0) {
      console.log(`Migrated ${sessionResult.modifiedCount} sessions to default restaurant.`);
    }

  } catch (err) {
    console.error('Error during seeding/migration:', err.message);
  }
};
seedDefaultUsers();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Middleware
app.use(cors());
app.use(express.json());

// Middleware to require restaurant context
const requireRestaurant = (req, res, next) => {
  const restaurantId = req.header('x-restaurant-id');
  if (!restaurantId) {
    return res.status(400).json({ error: 'Restaurant context (x-restaurant-id header) is required.' });
  }
  req.restaurantId = restaurantId;
  next();
};

// API Routes
app.use('/api/raw-items', requireRestaurant, rawItemsRouter);
app.use('/api/menu-items', requireRestaurant, menuItemsRouter);
app.use('/api/recipes', requireRestaurant, recipesRouter);
app.use('/api/sessions', requireRestaurant, sessionsRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/manager', managerRouter);

// Basic Health Check Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
