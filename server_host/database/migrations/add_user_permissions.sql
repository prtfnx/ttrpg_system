-- Migration: Add role and tier columns to users table
-- Production-ready compendium system with permission management
-- Date: 2024

-- Add role column (default: player)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'player';

-- Add tier column (default: free)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'free';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);

-- Update existing users to have default values
UPDATE users 
SET role = 'player' 
WHERE role IS NULL;

UPDATE users 
SET tier = 'free' 
WHERE tier IS NULL;

-- Add check constraints for valid values
ALTER TABLE users 
ADD CONSTRAINT IF NOT EXISTS check_user_role 
CHECK (role IN ('player', 'dm', 'admin'));

ALTER TABLE users 
ADD CONSTRAINT IF NOT EXISTS check_user_tier 
CHECK (tier IN ('free', 'premium'));

-- Grant default permissions comment
COMMENT ON COLUMN users.role IS 'User role: player, dm, or admin - determines base permissions';
COMMENT ON COLUMN users.tier IS 'User subscription tier: free or premium - determines access level';

-- Migration complete
