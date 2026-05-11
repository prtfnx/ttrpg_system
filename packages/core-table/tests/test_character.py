from core_table.Character import Character


def make_character(hp: int = 20, max_hp: int = 20) -> Character:
    c = Character(name='Test Hero')
    c.hit_points = hp
    c.max_hit_points = max_hp
    c.temporary_hit_points = 0
    c.death_save_successes = [False, False, False]
    c.death_save_failures = [False, False, False]
    return c


class TestTakeDamage:
    def test_no_damage_when_amount_zero(self):
        c = make_character()
        result = c.take_damage(0)
        assert result['status'] == 'no_damage'
        assert c.hit_points == 20

    def test_no_damage_when_negative(self):
        c = make_character()
        result = c.take_damage(-5)
        assert result['status'] == 'no_damage'

    def test_reduces_hp(self):
        c = make_character()
        c.take_damage(5)
        assert c.hit_points == 15

    def test_hp_does_not_go_below_zero(self):
        c = make_character(hp=5)
        c.take_damage(100)
        assert c.hit_points == 0

    def test_applies_to_temp_hp_first(self):
        c = make_character(hp=20)
        c.temporary_hit_points = 5
        result = c.take_damage(3)
        assert result['temp_damage'] == 3
        assert result['hp_damage'] == 0
        assert c.temporary_hit_points == 2
        assert c.hit_points == 20

    def test_overflow_temp_hp_spills_to_hp(self):
        c = make_character(hp=20)
        c.temporary_hit_points = 5
        c.take_damage(8)
        assert c.temporary_hit_points == 0
        assert c.hit_points == 17

    def test_status_unconscious_at_zero_hp(self):
        c = make_character(hp=5)
        result = c.take_damage(5)
        assert result['status'] == 'unconscious'

    def test_status_conscious_when_hp_remains(self):
        c = make_character(hp=20)
        result = c.take_damage(5)
        assert result['status'] == 'conscious'


class TestHeal:
    def test_heal_increases_hp(self):
        c = make_character(hp=10, max_hp=20)
        healed = c.heal(5)
        assert healed == 5
        assert c.hit_points == 15

    def test_heal_does_not_exceed_max_hp(self):
        c = make_character(hp=18, max_hp=20)
        healed = c.heal(10)
        assert healed == 2
        assert c.hit_points == 20

    def test_heal_zero_returns_zero(self):
        c = make_character()
        assert c.heal(0) == 0

    def test_heal_negative_returns_zero(self):
        c = make_character()
        assert c.heal(-5) == 0

    def test_heal_resets_death_saves_when_revived(self):
        c = make_character(hp=0)
        c.death_save_failures = [True, True, False]
        c.death_save_successes = [True, False, False]
        c.heal(1)
        assert c.hit_points == 1
        assert not any(c.death_save_failures)
        assert not any(c.death_save_successes)


class TestStatusChecks:
    def test_is_alive_when_hp_above_zero(self):
        assert make_character(hp=1).is_alive()

    def test_not_alive_at_zero_hp(self):
        assert not make_character(hp=0).is_alive()

    def test_is_conscious_when_hp_positive(self):
        assert make_character(hp=5).is_conscious()

    def test_not_conscious_at_zero_hp(self):
        assert not make_character(hp=0).is_conscious()

    def test_is_dying_at_zero_hp_without_failures(self):
        c = make_character(hp=0)
        assert c.is_dying()

    def test_not_dying_when_alive(self):
        assert not make_character(hp=5).is_dying()

    def test_is_dead_with_three_failures(self):
        c = make_character(hp=0)
        c.death_save_failures = [True, True, True]
        assert c.is_dead()

    def test_not_dead_with_two_failures(self):
        c = make_character(hp=0)
        c.death_save_failures = [True, True, False]
        assert not c.is_dead()

    def test_is_stable_with_three_successes(self):
        c = make_character(hp=0)
        c.death_save_successes = [True, True, True]
        assert c.is_stable()


class TestDeathSaves:
    def test_natural_20_revives(self):
        c = make_character(hp=0)
        result = c.make_death_save(20)
        assert result['result'] == 'recovered'
        assert c.hit_points == 1

    def test_natural_1_adds_two_failures(self):
        c = make_character(hp=0)
        c.make_death_save(1)
        assert sum(c.death_save_failures) == 2

    def test_roll_10_plus_adds_success(self):
        c = make_character(hp=0)
        c.make_death_save(15)
        assert sum(c.death_save_successes) == 1

    def test_roll_2_to_9_adds_failure(self):
        c = make_character(hp=0)
        c.make_death_save(5)
        assert sum(c.death_save_failures) == 1

    def test_three_successes_leads_to_stable(self):
        c = make_character(hp=0)
        c.make_death_save(15)
        c.make_death_save(15)
        result = c.make_death_save(15)
        assert result['result'] == 'stable'

    def test_three_failures_leads_to_dead(self):
        c = make_character(hp=0)
        c.make_death_save(5)
        c.make_death_save(5)
        result = c.make_death_save(5)
        assert result['result'] == 'dead'

    def test_not_dying_skips_death_save(self):
        c = make_character(hp=10)
        result = c.make_death_save(15)
        assert result['result'] == 'not_applicable'


class TestTemporaryHP:
    def test_add_temp_hp(self):
        c = make_character()
        c.add_temporary_hp(10)
        assert c.temporary_hit_points == 10

    def test_temp_hp_does_not_stack_takes_higher(self):
        c = make_character()
        c.add_temporary_hp(10)
        c.add_temporary_hp(5)
        assert c.temporary_hit_points == 10

    def test_higher_temp_hp_replaces_lower(self):
        c = make_character()
        c.add_temporary_hp(5)
        c.add_temporary_hp(15)
        assert c.temporary_hit_points == 15

    def test_get_total_hp_includes_temp(self):
        c = make_character(hp=10)
        c.temporary_hit_points = 5
        assert c.get_total_hp() == 15


class TestInventoryAndSpells:
    def test_add_item(self):
        c = make_character()
        c.add_item('Sword')
        assert 'Sword' in c.inventory

    def test_remove_item(self):
        c = make_character()
        c.add_item('Shield')
        assert c.remove_item('Shield')
        assert 'Shield' not in c.inventory

    def test_remove_nonexistent_item_returns_false(self):
        assert not make_character().remove_item('Ghost Item')

    def test_add_spell(self):
        c = make_character()
        spell = object()
        c.add_spell(spell)
        assert spell in c.spells

    def test_add_same_spell_twice_does_not_duplicate(self):
        c = make_character()
        spell = object()
        c.add_spell(spell)
        c.add_spell(spell)
        assert c.spells.count(spell) == 1

    def test_remove_spell(self):
        c = make_character()
        spell = object()
        c.add_spell(spell)
        assert c.remove_spell(spell)
        assert spell not in c.spells


class TestSerialization:
    def test_to_dict_and_from_dict_roundtrip(self):
        c = make_character(hp=15, max_hp=20)
        c.name = 'Aria'
        c.add_item('Dagger')
        d = c.to_dict()
        c2 = Character.from_dict(d)
        assert c2.name == 'Aria'
        assert c2.hit_points == 15
        assert 'Dagger' in c2.inventory

    def test_to_dict_contains_vtt_fields(self):
        c = make_character()
        d = c.to_dict()
        assert 'sprite_id' in d
        assert 'position_x' in d
        assert 'token_size' in d

    def test_from_dict_defaults_on_missing_fields(self):
        c = Character.from_dict({'name': 'Bare'})
        assert c.name == 'Bare'
        assert c.speed == 30
        assert c.visibility is True
