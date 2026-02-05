export interface RawPlayerData {
  id: number;
  f: string; // first name
  l: string; // last name
  c?: string; // common name
  r: number; // rating
  n: number; // nation
}

export interface PlayerItem {
  assetId: number;
  rating: number;
  possiblePositions: string[];
  nation: number;
  leagueId: number;
  teamid: number;
}

export interface AuctionInfo {
  itemData: PlayerItem;
}

export interface TradePileResponse {
  auctionInfo: AuctionInfo[];
}

export interface StorageResponse {
  itemData: PlayerItem[];
}

export interface DuplicatedResponse {
  itemData: PlayerItem[];
}

export interface PlayersJsonResponse {
  LegendsPlayers: RawPlayerData[];
  Players: RawPlayerData[];
}

export interface ProcessedPlayer {
  assetId: number;
  name: string;
  rating: number;
  position: string;
  nation: string;
  nationId: number;
  nationImg?: string;
  league: string;
  leagueId: number;
  leagueImg?: string;
  team: string;
  teamId: number;
  teamImg?: string;
  type: 'Transfer' | 'Storage' | 'Duplicated';
}

export interface AggregatedPlayer extends ProcessedPlayer {
  copies: number;
  types: ('Transfer' | 'Storage' | 'Duplicated')[];
}

export interface FilterState {
  ratingRange: [number, number];
  positions: string[];
  nations: string[];
  leagues: string[];
  teams: string[];
  types: ('Transfer' | 'Storage' | 'Duplicated')[];
  multipleCopiesOnly: boolean;
}

export interface Team {
  id: number;
  name: string;
}

export interface League {
  id: number;
  name: string;
}

export interface Nation {
  id: number;
  name: string;
}
