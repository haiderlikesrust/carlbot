# Admin Panel Setup Guide

## Security Features

The admin panel is protected with:
- **JWT Token Authentication** - Secure token-based authentication
- **Bcrypt Password Hashing** - Passwords are hashed with 10 rounds
- **Separate Admin JWT Secret** - Uses different secret from regular users
- **Token Expiry** - Admin tokens expire after 24 hours
- **Account Verification** - Verifies admin account is active on each request
- **Activity Logging** - All admin logins are logged

## Creating Your First Admin User

Run the admin creation script:

```bash
npm run create-admin
```

This will prompt you for:
- Username (minimum 3 characters)
- Email (optional)
- Password (minimum 8 characters)
- Password confirmation

**Important:** Choose a strong password! The admin panel has full control over Carlbot.

## Accessing the Admin Panel

1. Navigate to `/admin` in your browser
2. You'll be prompted to login
3. Enter your admin credentials
4. You'll stay logged in for 24 hours (token stored in localStorage)

## Security Best Practices

1. **Change Default Credentials**: If you created a default admin, change it immediately
2. **Use Strong Passwords**: Minimum 8 characters, mix of letters, numbers, symbols
3. **Limit Admin Accounts**: Only create admin accounts for trusted users
4. **Monitor Activity**: Check the activity log regularly for suspicious activity
5. **Token Security**: Tokens are stored in localStorage - clear them if needed
6. **Environment Variables**: Set `ADMIN_JWT_SECRET` in your `.env` for production

## Environment Variables

Add to your `.env` file:

```env
# Admin JWT Secret (use a strong random string in production)
ADMIN_JWT_SECRET=your-super-secret-admin-key-change-this

# Regular JWT Secret (also used if ADMIN_JWT_SECRET not set)
JWT_SECRET=your-secret-key-change-in-production
```

## Managing Admin Users

Currently, admin users must be managed directly in the database. Future updates may include:
- Admin user management UI
- Password reset functionality
- Role-based permissions

## Troubleshooting

**Can't login?**
- Verify your username and password are correct
- Check that your admin account is active (`is_active = 1` in database)
- Clear localStorage and try again

**Token expired?**
- Simply login again - tokens expire after 24 hours for security

**Forgot password?**
- You'll need to reset it directly in the database or create a new admin account

## Database Schema

Admin users are stored in the `admin_users` table:
- `id` - Primary key
- `username` - Unique username
- `password_hash` - Bcrypt hashed password
- `email` - Optional email
- `is_active` - Account status (1 = active, 0 = disabled)
- `last_login` - Timestamp of last login
- `created_at` - Account creation timestamp
- `updated_at` - Last update timestamp
