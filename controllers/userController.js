const User = require('../models/User');
const admin = require('../firebaseAdmin');

class UserController {
  static async createUser(req, res) {
    try {
      const { name, email, password, role, program } = req.body;

      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      let firebaseUser;
      try {
        firebaseUser = await admin.auth().createUser({
          email: email.toLowerCase(),
          password: password,
          displayName: name,
          emailVerified: false
        });

        await admin.auth().setCustomUserClaims(firebaseUser.uid, { role });
      } catch (firebaseError) {
        return res.status(400).json({ error: `Firebase error: ${firebaseError.message}` });
      }

      const userData = {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: password,
        role: role,
        uid: firebaseUser.uid,
        isActive: true
      };

      if (role === 'student') {
        userData.program = program?.trim();
      }

      const newUser = await User.create(userData);

      res.status(201).json({
        success: true,
        message: `${role.charAt(0).toUpperCase() + role.slice(1)} created successfully`,
        user: newUser.getProfile()
      });
    } catch (error) {
      if (firebaseUser) {
        try {
          await admin.auth().deleteUser(firebaseUser.uid);
        } catch (cleanupError) {}
      }
      res.status(500).json({ error: 'Failed to create user' });
    }
  }

  static async bulkCreateUsers(req, res) {
    try {
      const { users } = req.body;
      
      if (!Array.isArray(users) || users.length === 0) {
        return res.status(400).json({ error: 'No users provided' });
      }

      const results = {
        success: 0,
        failed: 0,
        errors: []
      };

      const createdUsers = [];
      const firebaseUsers = [];

      for (const userData of users) {
        try {
          const { name, email, password, role, program } = userData;

          if (!name || !email || !password || !role) {
            results.errors.push(`${email || 'Unknown'}: Missing required fields`);
            results.failed++;
            continue;
          }

          const existingUser = await User.findOne({ email: email.toLowerCase() });
          if (existingUser) {
            results.errors.push(`${email}: User already exists`);
            results.failed++;
            continue;
          }

          let firebaseUser;
          try {
            firebaseUser = await admin.auth().createUser({
              email: email.toLowerCase(),
              password: password,
              displayName: name,
              emailVerified: false
            });
            
            await admin.auth().setCustomUserClaims(firebaseUser.uid, { role });
            firebaseUsers.push(firebaseUser);
          } catch (firebaseError) {
            results.errors.push(`${email}: Firebase error - ${firebaseError.message}`);
            results.failed++;
            continue;
          }

          const userDoc = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: password,
            role: role,
            uid: firebaseUser.uid,
            isActive: true
          };

          if (role === 'student') {
            userDoc.program = program?.trim();
          }

          const newUser = await User.create(userDoc);
          createdUsers.push(newUser);
          results.success++;

        } catch (error) {
          results.errors.push(`${userData.email || 'Unknown'}: ${error.message}`);
          results.failed++;
        }
      }

      if (results.success === 0 && createdUsers.length === 0) {
        for (const fbUser of firebaseUsers) {
          try {
            await admin.auth().deleteUser(fbUser.uid);
          } catch (cleanupError) {}
        }
        
        return res.status(400).json({
          error: 'All users failed to create',
          results: results
        });
      }

      res.json({
        success: true,
        message: `Created ${results.success} users, ${results.failed} failed`,
        results: {
          total: users.length,
          created: results.success,
          failed: results.failed,
          errors: results.errors,
          users: createdUsers.map(u => u.getProfile())
        }
      });

    } catch (error) {
      res.status(500).json({ error: 'Failed to process bulk upload' });
    }
  }

  static async getUsers(req, res) {
    try {
      const { role, search, page = 1, limit = 50 } = req.query;
      
      const query = {};
      
      if (role && ['student', 'staff', 'admin'].includes(role)) {
        query.role = role;
      }
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { program: { $regex: search, $options: 'i' } }
        ];
      }
      
      query.isActive = true;
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const [users, total] = await Promise.all([
        User.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .select('-password'),
        User.countDocuments(query)
      ]);
      
      res.json({
        success: true,
        users: users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }

  static async getUser(req, res) {
    try {
      const { id } = req.params;
      
      let user;
      if (mongoose.Types.ObjectId.isValid(id)) {
        user = await User.findById(id).select('-password');
      } else {
        user = await User.findOne({ email: id.toLowerCase() }).select('-password');
      }
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({
        success: true,
        user: user
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  }

  static async updateUser(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      if (updateData.role && updateData.role !== user.role) {
        return res.status(400).json({ error: 'Cannot change user role' });
      }
      
      if (updateData.email && updateData.email !== user.email) {
        return res.status(400).json({ error: 'Cannot change email' });
      }
      
      delete updateData.password;
      delete updateData.uid;
      
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          user[key] = updateData[key];
        }
      });
      
      await user.save();
      
      if (updateData.name && user.uid) {
        try {
          await admin.auth().updateUser(user.uid, {
            displayName: updateData.name.trim()
          });
        } catch (firebaseError) {}
      }
      
      res.json({
        success: true,
        message: 'User updated successfully',
        user: user.getProfile()
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update user' });
    }
  }

  static async deleteUser(req, res) {
    try {
      const { id } = req.params;
      const { email } = req.body;
      
      let user;
      if (id) {
        user = await User.findById(id);
      } else if (email) {
        user = await User.findOne({ email: email.toLowerCase() });
      }
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      if (user.uid) {
        try {
          await admin.auth().deleteUser(user.uid);
        } catch (firebaseError) {}
      }
      
      await User.findByIdAndDelete(user._id);
      
      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }

  static async deactivateUser(req, res) {
    try {
      const { id } = req.params;
      
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      user.isActive = false;
      await user.save();
      
      if (user.uid) {
        try {
          await admin.auth().updateUser(user.uid, { disabled: true });
        } catch (firebaseError) {}
      }
      
      res.json({
        success: true,
        message: 'User deactivated successfully'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to deactivate user' });
    }
  }
}

module.exports = UserController;