import type {
  TradePileResponse,
  StorageResponse,
  DuplicatedResponse,
  PlayersJsonResponse,
  RawPlayerData,
  ProcessedPlayer,
} from '../types/player';

const CORS_PROXY = 'https://cors-anywhere-lorenzo.herokuapp.com/';
const EA_STATIC_URL = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/content/26E4D4D6-8DBB-4A9A-BD99-9C47D3AA341D/2026/fut/items/web';
const EA_IMAGES_URL = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/content/26E4D4D6-8DBB-4A9A-BD99-9C47D3AA341D/2026/fut/items/images/mobile';
const FUT_API_URL = 'https://utas.mob.v4.prd.futc-ext.gcp.ea.com/ut/game/fc26';
const FUTGG_API_URL = 'https://www.fut.gg/api/fut/fc-core-data';
const FUTNEXT_API_URL = 'https://enhancer-api.futnext.com';

// Generate EA CDN URLs for clubs, nations, and leagues
const getClubImageUrl = (clubId: number): string => {
  return `${EA_IMAGES_URL}/clubs/dark/${clubId}.png`;
};

const getNationImageUrl = (nationId: number): string => {
  return `${EA_IMAGES_URL}/flags/light/${nationId}.png`;
};

const getLeagueImageUrl = (leagueId: number): string => {
  return `${EA_IMAGES_URL}/leagues/dark/${leagueId}.png`;
};

interface FutGGClub {
  eaId: number;
  name: string;
  siblingClubEaId?: number;
  imageUrl?: string;
}

interface FutGGNation {
  eaId: number;
  name: string;
  imageUrl?: string;
}

interface FutGGLeague {
  eaId: number;
  name: string;
  imageUrl?: string;
}

interface FutGGResponse {
  data: {
    clubs: FutGGClub[];
    nations: FutGGNation[];
    leagues: FutGGLeague[];
  };
}

export interface EntityInfo {
  name: string;
  imgUrl?: string;
}

interface CachedData {
  players: Map<number, RawPlayerData>;
  teams: Map<number, EntityInfo>;
  leagues: Map<number, EntityInfo>;
  nations: Map<number, EntityInfo>;
}

let cachedData: CachedData | null = null;
let staticDataPromise: Promise<CachedData> | null = null;

async function corsRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const corsUrl = CORS_PROXY + url;

  const headers = new Headers(options?.headers);
  headers.set('X-Requested-With', 'XMLHttpRequest');

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const response = await fetch(corsUrl, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchFutGGData(): Promise<{
  teams: Map<number, EntityInfo>;
  leagues: Map<number, EntityInfo>;
  nations: Map<number, EntityInfo>;
}> {
  const url = `${FUTGG_API_URL}/?evolution_names=false&clubs=true&nations=true&leagues=true&rarities=false&rarity_squads=false&evolutions_lite=false&evolutions=false&active_evolutions=false&rarity_groups=false&roles=false&base_roles=false&play_styles=false&build_up_styles=false&defensive_approaches=false`;

  const response = await corsRequest<FutGGResponse>(url);

  // Build teams map (including sibling clubs) - use EA CDN for images
  const teams = new Map<number, EntityInfo>();
  for (const club of response.data.clubs) {
    teams.set(club.eaId, { name: club.name, imgUrl: getClubImageUrl(club.eaId) });
    // Also add sibling club ID with same info
    if (club.siblingClubEaId) {
      teams.set(club.siblingClubEaId, { name: club.name, imgUrl: getClubImageUrl(club.siblingClubEaId) });
    }
  }

  // Build nations map - use EA CDN for images
  const nations = new Map<number, EntityInfo>();
  for (const nation of response.data.nations) {
    nations.set(nation.eaId, { name: nation.name, imgUrl: getNationImageUrl(nation.eaId) });
  }

  // Build leagues map - use EA CDN for images
  const leagues = new Map<number, EntityInfo>();
  for (const league of response.data.leagues) {
    leagues.set(league.eaId, { name: league.name, imgUrl: getLeagueImageUrl(league.eaId) });
  }

  return { teams, leagues, nations };
}

export const fetchStaticData = async (): Promise<CachedData> => {
  if (cachedData) {
    return cachedData;
  }

  if (staticDataPromise) {
    return staticDataPromise;
  }
  // Create and store the promise to prevent duplicate fetches
  staticDataPromise = (async () => {
    // Fetch player data from EA and nation/league/team data from fut.gg
    const [playersResponse, futggData] = await Promise.all([
      corsRequest<PlayersJsonResponse>(`${EA_STATIC_URL}/players.json?_=${Date.now()}`),
      fetchFutGGData(),
    ]);

    const allPlayers = [
      ...(playersResponse.LegendsPlayers || []),
      ...(playersResponse.Players || []),
    ];
    const playersMap = new Map<number, RawPlayerData>();

    for (const player of allPlayers) {
      playersMap.set(player.id, player);
    }

    cachedData = {
      players: playersMap,
      teams: futggData.teams,
      leagues: futggData.leagues,
      nations: futggData.nations,
    };

    return cachedData;
  })();

  return staticDataPromise;
};

async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  name: string,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await corsRequest<T>(url, options);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${name} after ${maxRetries} retries`);
}

export const fetchTradePile = async (sid: string): Promise<TradePileResponse> => {
  return fetchWithRetry<TradePileResponse>(
    `${FUT_API_URL}/tradepile`,
    { headers: { 'X-UT-SID': sid } },
    'Trade pile'
  );
};

export const fetchStorage = async (sid: string): Promise<StorageResponse> => {
  return fetchWithRetry<StorageResponse>(
    `${FUT_API_URL}/storagepile?skuMode=FUT`,
    { headers: { 'X-UT-SID': sid } },
    'Storage'
  );
};

export const fetchDuplicated = async (sid: string): Promise<DuplicatedResponse> => {
  return fetchWithRetry<DuplicatedResponse>(
    `${FUT_API_URL}/purchased/items`,
    { headers: { 'X-UT-SID': sid } },
    'Duplicated items'
  );
};

export interface FetchResult {
  players: ProcessedPlayer[];
  warnings: string[];
}

export const processPlayers = async (sid: string): Promise<FetchResult> => {
  const staticData = await fetchStaticData();
  const warnings: string[] = [];

  const [tradePileResult, storageResult, duplicatedResult] = await Promise.all([
    fetchTradePile(sid).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Trade pile failed: ${msg}`);
      return { auctionInfo: [] } as TradePileResponse;
    }),
    fetchStorage(sid).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Storage failed after 3 retries: ${msg}`);
      return { itemData: [] } as StorageResponse;
    }),
    fetchDuplicated(sid).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Duplicated items failed: ${msg}`);
      return { itemData: [] } as DuplicatedResponse;
    }),
  ]);

  const tradePile = tradePileResult;
  const storage = storageResult;
  const duplicated = duplicatedResult;

  const processedPlayers: ProcessedPlayer[] = [];

  const getTeamName = (teamId: number): string => {
    return staticData.teams.get(teamId)?.name || 'Unknown';
  };

  const getLeagueName = (leagueId: number): string => {
    return staticData.leagues.get(leagueId)?.name || 'Unknown';
  };

  const getNationName = (nationId: number): string => {
    return staticData.nations.get(nationId)?.name || 'Unknown';
  };

  const getTeamImg = (teamId: number): string | undefined => {
    return staticData.teams.get(teamId)?.imgUrl;
  };

  const getLeagueImg = (leagueId: number): string | undefined => {
    return staticData.leagues.get(leagueId)?.imgUrl;
  };

  const getNationImg = (nationId: number): string | undefined => {
    return staticData.nations.get(nationId)?.imgUrl;
  };

  const getPlayerName = (assetId: number): string => {
    const player = staticData.players.get(assetId);
    if (!player) return 'Unknown';
    return player.c || `${player.f} ${player.l}`;
  };

  // Process trade pile
  if (tradePile.auctionInfo) {
    for (const auction of tradePile.auctionInfo) {
      const item = auction.itemData;
      processedPlayers.push({
        assetId: item.assetId,
        name: getPlayerName(item.assetId),
        rating: item.rating,
        position: item.possiblePositions?.join(' / ') || 'Unknown',
        nation: getNationName(item.nation),
        nationId: item.nation,
        nationImg: getNationImg(item.nation),
        league: getLeagueName(item.leagueId),
        leagueId: item.leagueId,
        leagueImg: getLeagueImg(item.leagueId),
        team: getTeamName(item.teamid),
        teamId: item.teamid,
        teamImg: getTeamImg(item.teamid),
        type: 'Transfer',
      });
    }
  }

  // Process storage
  if (storage.itemData) {
    for (const item of storage.itemData) {
      processedPlayers.push({
        assetId: item.assetId,
        name: getPlayerName(item.assetId),
        rating: item.rating,
        position: item.possiblePositions?.join(' / ') || 'Unknown',
        nation: getNationName(item.nation),
        nationId: item.nation,
        nationImg: getNationImg(item.nation),
        league: getLeagueName(item.leagueId),
        leagueId: item.leagueId,
        leagueImg: getLeagueImg(item.leagueId),
        team: getTeamName(item.teamid),
        teamId: item.teamid,
        teamImg: getTeamImg(item.teamid),
        type: 'Storage',
      });
    }
  }

  // Process duplicated
  if (duplicated.itemData) {
    for (const item of duplicated.itemData) {
      processedPlayers.push({
        assetId: item.assetId,
        name: getPlayerName(item.assetId),
        rating: item.rating,
        position: item.possiblePositions?.join(' / ') || 'Unknown',
        nation: getNationName(item.nation),
        nationId: item.nation,
        nationImg: getNationImg(item.nation),
        league: getLeagueName(item.leagueId),
        leagueId: item.leagueId,
        leagueImg: getLeagueImg(item.leagueId),
        team: getTeamName(item.teamid),
        teamId: item.teamid,
        teamImg: getTeamImg(item.teamid),
        type: 'Duplicated',
      });
    }
  }

  return { players: processedPlayers, warnings };
};

export const clearCache = () => {
  cachedData = null;
  staticDataPromise = null;
  sbcCache = null;
};

// SBC API types and functions
export interface SBCSet {
  setId: number;
  name: string;
  description: string;
  challengesCount: number;
  challengesCompletedCount: number;
  categoryId: number;
  repeatable: boolean;
  repeats: number;
  timesCompleted: number;
}

interface SBCCategory {
  categoryId: number;
  name: string;
  sets: SBCSet[];
}

export interface SBCSetsResponse {
  categories: SBCCategory[];
}

export interface SBCChallengeEligibility {
  type: string;
  eligibilitySlot: number;
  eligibilityKey: number;
  eligibilityValue: number;
}

export interface SBCChallenge {
  challengeId: number;
  name: string;
  formation: string;
  description: string;
  status: string;
  elgReq: SBCChallengeEligibility[];
}

export interface SBCChallengeDetail {
  challengeId: number;
  name: string;
  formation: string;
  teamRating: number | null;
}

export interface SBCChallengesResponse {
  challenges: SBCChallenge[];
}

export interface SBCVote {
  id: number;
  likes: number;
  dislikes: number;
}

export interface SBCVotesResponse {
  votes: SBCVote[];
}

export interface SBCWithDetails {
  setId: number;
  name: string;
  challengesCount: number;
  likes: number;
  dislikes: number;
  likePercent: number;
  rankScore: number;
}

let sbcCache: { data: SBCWithDetails[]; timestamp: number } | null = null;
const SBC_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const fetchSBCSets = async (sid: string): Promise<SBCSet[]> => {
  const response = await corsRequest<SBCSetsResponse>(
    `${FUT_API_URL}/sbs/sets`,
    { headers: { 'X-UT-SID': sid } }
  );

  const allSets: SBCSet[] = [];
  if (response.categories && Array.isArray(response.categories)) {
    for (const category of response.categories) {
      if (category.sets && Array.isArray(category.sets)) {
        allSets.push(...category.sets);
      }
    }
  }

  return allSets;
};

export const fetchSBCVotes = async (ids: number[]): Promise<Map<number, SBCVote>> => {
  if (ids.length === 0) {
    return new Map();
  }
  const idsString = ids.join('_');

  try {
    const response = await corsRequest<unknown>(
      `${FUTNEXT_API_URL}/vote/votes?ids=${idsString}&type=sbcSet`
    );

    const votesMap = new Map<number, SBCVote>();

    const votesArray = Array.isArray(response) ? response : [];
    for (const vote of votesArray) {
      const voteData = vote as { dataId: string; likes: number; disLikes: number };
      const id = parseInt(voteData.dataId, 10);
      if (!isNaN(id)) {
        votesMap.set(id, {
          id,
          likes: voteData.likes || 0,
          dislikes: voteData.disLikes || 0,
        });
      }
    }

    return votesMap;
  } catch {
    return new Map();
  }
};

export const fetchSBCChallenges = async (sid: string, setId: number): Promise<SBCChallenge[]> => {
  const response = await corsRequest<SBCChallengesResponse>(
    `${FUT_API_URL}/sbs/setId/${setId}/challenges`,
    { headers: { 'X-UT-SID': sid } }
  );
  return response.challenges || [];
};

export const fetchSBCSetChallengeDetails = async (sid: string, setId: number): Promise<SBCChallengeDetail[]> => {
  const challenges = await fetchSBCChallenges(sid, setId);

  return challenges.map(challenge => {
    const teamRatingReq = challenge.elgReq?.find(
      req => req.type === 'TEAM_RATING_1_TO_100'
    );

    return {
      challengeId: challenge.challengeId,
      name: challenge.name,
      formation: challenge.formation,
      teamRating: teamRatingReq?.eligibilityValue ?? null,
    };
  });
};

export const fetchAllSBCsWithDetails = async (sid: string): Promise<SBCWithDetails[]> => {
  if (sbcCache && Date.now() - sbcCache.timestamp < SBC_CACHE_DURATION) {
    return sbcCache.data;
  }

  const allSets = await fetchSBCSets(sid);

  const sets: SBCSet[] = [];

  for (const set of allSets) {
    const challengesRemaining = set.challengesCount - set.challengesCompletedCount;

    if (set.repeatable) {
      if (set.timesCompleted >= set.repeats && challengesRemaining === 0) {
        continue;
      }
    } else {
      if (challengesRemaining === 0) {
        continue;
      }
    }

    sets.push({
      ...set,
      challengesCount: challengesRemaining
    });
  }

  if (sets.length === 0) {
    return [];
  }

  const setIds = sets.map(s => s.setId);
  let votes = new Map<number, SBCVote>();
  try {
    votes = await fetchSBCVotes(setIds);
  } catch {
    // Votes are optional, continue without them
  }

  const result = sets.map(set => {
    const vote = votes.get(set.setId);
    const likes = vote?.likes || 0;
    const dislikes = vote?.dislikes || 0;
    const totalVotes = likes + dislikes;

    // Calculate like percentage (0-100)
    const likePercent = totalVotes > 0 ? (likes / totalVotes) * 100 : 0;

    // Rank score: combines vote count with positive rate
    // Uses Wilson score lower bound for ranking (like Reddit's "hot" algorithm)
    // This gives more weight to items with more votes while still considering positive rate
    const z = 1.96; // 95% confidence
    const phat = totalVotes > 0 ? likes / totalVotes : 0;
    const rankScore = totalVotes > 0
      ? (phat + z*z/(2*totalVotes) - z * Math.sqrt((phat*(1-phat) + z*z/(4*totalVotes))/totalVotes)) / (1 + z*z/totalVotes)
      : 0;

    return {
      setId: set.setId,
      name: set.name,
      challengesCount: set.challengesCount || 0,
      likes,
      dislikes,
      likePercent,
      rankScore,
    };
  });

  result.sort((a, b) => b.rankScore - a.rankScore);

  sbcCache = { data: result, timestamp: Date.now() };

  return result;
};
