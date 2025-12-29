-- Add token_asset_id column to session_characters table
-- Links characters directly to their token assets

-- Add the column (nullable for existing rows)
ALTER TABLE session_characters ADD COLUMN token_asset_id VARCHAR(100);
