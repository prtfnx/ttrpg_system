import type { WizardFormData } from './components/CharacterWizard/WizardFormData';

export interface CharacterDraft {
  draft_id: string;
  session_id: number;
  owner_user_id: number;
  draft_data: Partial<WizardFormData>;
  schema_version: 1;
  current_step: number;
  version: number;
  status: 'active' | 'converted' | 'abandoned';
  converted_character_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_modified_by?: number | null;
}
