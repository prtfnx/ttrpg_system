import os
import pickle
import Character
import sys

# RmlUi imports (assuming python bindings are available)
try:
    import rmlui
except ImportError:
    rmlui = None  # Handle gracefully if not available

CHARACTER_SAVE_DIR = "characters"

class CharacterManager:
    def __init__(self):
        self.characters = []
        if not os.path.exists(CHARACTER_SAVE_DIR):
            os.makedirs(CHARACTER_SAVE_DIR)

    def create_character(self, name, **kwargs):
        character = Character(name, **kwargs)
        self.characters.append(character)
        return character

    def save_character(self, character):
        path = os.path.join(CHARACTER_SAVE_DIR, f"{character.name}.chr")
        with open(path, "wb") as f:
            pickle.dump(character, f)

    def load_character(self, name):
        path = os.path.join(CHARACTER_SAVE_DIR, f"{name}.chr")
        if not os.path.exists(path):
            raise FileNotFoundError(f"No character named {name}")
        with open(path, "rb") as f:
            character = pickle.load(f)
        self.characters.append(character)
        return character

    def list_characters(self):
        return [f[:-4] for f in os.listdir(CHARACTER_SAVE_DIR) if f.endswith(".chr")]

    def load_all_characters(self):
        for name in self.list_characters():
            self.load_character(name)

    def run_gui(self):
        if rmlui is None:
            print("RmlUi not available. GUI cannot be started.")
            return

        # Minimal RmlUi setup
        app = rmlui.Application()
        context = app.CreateContext("CharacterManager", 800, 600)
        document = context.LoadDocument("character_manager.rml")
        if document:
            document.Show()
        else:
            print("Failed to load RML document for GUI.")
            return

        # Main loop
        running = True
        while running:
            app.ProcessEvents()
            context.Update()
            context.Render()
            # Add event handling for closing, etc.

    def run_cli(self):
        print("Character Manager CLI")
        while True:
            print("\nOptions: [list, create, load, save, exit]")
            cmd = input("> ").strip().lower()
            if cmd == "list":
                print("Characters:", self.list_characters())
            elif cmd == "create":
                name = input("Character name: ")
                char = self.create_character(name)
                print(f"Created: {char}")
            elif cmd == "load":
                name = input("Character name to load: ")
                try:
                    char = self.load_character(name)
                    print(f"Loaded: {char}")
                except Exception as e:
                    print(e)
            elif cmd == "save":
                name = input("Character name to save: ")
                char = next((c for c in self.characters if c.name == name), None)
                if char:
                    self.save_character(char)
                    print("Saved.")
                else:
                    print("Character not found.")
            elif cmd == "exit":
                break
            else:
                print("Unknown command.")

if __name__ == "__main__":
    mgr = CharacterManager()
    if "--gui" in sys.argv:
        mgr.run_gui()
    else:
        mgr.run_cli()