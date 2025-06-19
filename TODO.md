# TODO

## Core

### GUI
1. [ ] Complete character representation and make gui for character manager
2. [ ] Complete gui to support all operations with sprites, character, character manager. Including:
    - [ x] Manage tables
    - [ ] Create characters and npc
    - [x] Layer managment
    - [ ] Tools like measure, paint
    - [ ] Create monsters from compendium
3. [ x] All settings move to menu with redacting
4. [x] Server operations
5. [ ] Maybe switch gui lib??????
6. [ x] Connection status indication with all players

### SDL app
1. [ ] Rotation for sprites
2. [ ] Right click context menu
3. [x] Develop and implement working space with table. Only table is implemented now
4. [x] Scale options refactor
5. [ ] Layer render system
6. [x] Test for NET connection lost, bad internet and implement logic in client_sdl for it
7. [ x] Implement file storage with adequate functional
8. [ ] Basic manual fog of war
9. [ ] Audio and video(?) support

### Virtual Table
1. [ x] Implement proper DND-like character system with actions, hp, AC, rolls, spells, items
2. [ x] Connect virtual table characters and sdl table tokens with sync hp and etc
3. [ x] Actions characters can do to GUI
4. [ ] Level up system????
5. [ ] Implement basic DND mechanic like long rest and spell slots
6. [ ] Connection managment on serverside
7. [x] Log actions and revert system

### Common
1. [ x] Unit tests, integration tests
2. [x] Documentation
3. [x] Deployment and host

### Server
1. [ x] Implement clean protocol-implementation. For now it's for testing pretty dirty
2. [ x] Make proper interface and layer abstarctions

## Optional

### GUI
1. [ ] Make it more fantasy, glancy buttons and icons

### SDL app
1. [ ] Realtime context reading, like walls for movement, measure distance, render possible movement, select target, possible attack
2. [ ] Animations maybe?
3. [x] ~~Light system with fog of war dynamical for each character. And point of view light. Light for maps.~~
4. [x] Layer with hight to implement point of view for attacks, for hiding and etc
5. [ ] 3d regime?????

### Virtual Table
1. [ ] Implement complex dnd mechanic like spells effect, auto-attack, show possible movement. Traps and skill usage on map
2. [ ] Character manager with easy step-by-step creation
3. [ ] Rewrite in GO
4. [ ] Implement tools for map building. Use AI to generate maps, encounters, loot
5. [ ] Implement AI for monsters and automate their actions


### New Discovery
[ ] For action protocol consistenly use or name or id. 

### WORK NOW:
1) Implement proper client storage manager - client_protocol and storage_manager
2) Implement flow for assets
3) Implement render managment for layers
4) Light objects



