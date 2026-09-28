import { LandingScreen } from './landing.js';
import { SetupScreen } from './setup.js';
import { CalibrateScreen } from './calibrate.js';
import { MenuScreen, LevelScreen } from './menu.js';
import { FightScreen } from './fight.js';
import { ResultsScreen } from './results.js';
import { TutorialScreen } from './tutorial.js';
import { LobbyScreen } from './lobby.js';
import { RecordsScreen } from './records.js';
import { ShopScreen } from './shop.js';
import { FaceScreen } from './face.js';

export const SCREENS = {
  landing: LandingScreen,
  setup: SetupScreen,
  calibrate: CalibrateScreen,
  menu: MenuScreen,
  level: LevelScreen,
  tutorial: TutorialScreen,
  lobby: LobbyScreen,
  fight: FightScreen,
  results: ResultsScreen,
  records: RecordsScreen,
  shop: ShopScreen,
  face: FaceScreen,
};
