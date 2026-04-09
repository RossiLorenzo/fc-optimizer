import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  AppShell, Title, Text, Group, Stack, TextInput, Button, Paper, Table, Badge,
  MultiSelect, RangeSlider, Checkbox, LoadingOverlay, Alert, Box, Flex, Center,
  ActionIcon, Tooltip, Image, Grid, SimpleGrid,
} from '@mantine/core';
import type { ComboboxItem } from '@mantine/core';
import {
  IconRefresh, IconAlertCircle, IconPlayerPause, IconAlertTriangle,
  IconUsers, IconCards, IconTrophy, IconShirt, IconSend, IconTarget,
  IconPlugConnected, IconPlugConnectedX,
} from '@tabler/icons-react';
import { fetchStaticData, processPlayers, processPlayersFromBridge } from './services/api';
import type { FetchResult, BridgeInventory } from './services/api';
import type { ProcessedPlayer, AggregatedPlayer, FilterState } from './types/player';
import { AnimatedCounter } from './components/AnimatedCounter';
import { PaginatedTopList, type TopItem } from './components/PaginatedTopList';
import { RatingDistributionChart, TypeDistributionChart } from './components/StatsCharts';
import { SBCList, type SelectedChallenge } from './components/SBCList';
import { EntityWithImage } from './components/EntityWithImage';
import './App.css';

const ALL_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
const PLAYER_TYPES: ('Transfer' | 'Storage' | 'Duplicated')[] = ['Transfer', 'Storage', 'Duplicated'];

const TYPE_COLORS: Record<string, string> = { Transfer: 'blue', Storage: 'green', Duplicated: 'red' };

interface EntityOption extends ComboboxItem {
  value: string;
  label: string;
  imgUrl?: string;
}

function getRatingGradientColor(rating: number): string {
  if (rating <= 70) {
    const t = (rating - 47) / (70 - 47);
    return `color-mix(in srgb, var(--mantine-color-red-8) ${(1 - t) * 100}%, var(--mantine-color-red-6))`;
  } else if (rating <= 76) {
    const t = (rating - 71) / (76 - 71);
    return `color-mix(in srgb, var(--mantine-color-red-6) ${(1 - t) * 100}%, var(--mantine-color-orange-5))`;
  } else if (rating <= 83) {
    const t = (rating - 77) / (83 - 77);
    return `color-mix(in srgb, var(--mantine-color-yellow-5) ${(1 - t) * 100}%, var(--mantine-color-blue-6))`;
  } else if (rating <= 86) {
    const t = (rating - 84) / (86 - 84);
    return `color-mix(in srgb, var(--mantine-color-violet-7) ${(1 - t) * 100}%, var(--mantine-color-grape-5))`;
  } else {
    const t = Math.min(1, (rating - 87) / (99 - 87));
    return `color-mix(in srgb, var(--mantine-color-green-6) ${(1 - t) * 100}%, var(--mantine-color-teal-5))`;
  }
}

function playerKey(p: { assetId: number; rating: number }) {
  return `${p.assetId}-${p.rating}`;
}

function App() {
  const [sid, setSid] = useState('');
  const [players, setPlayers] = useState<ProcessedPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [staticDataLoading, setStaticDataLoading] = useState(true);

  // SBC push state
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [selectedChallenge, setSelectedChallenge] = useState<SelectedChallenge | null>(null);
  const [bridgeChallenge, setBridgeChallenge] = useState<SelectedChallenge | null>(null);
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null);

  // Bridge state
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const pushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Players already in the SBC squad
  const [sbcSquadPlayerKeys, setSbcSquadPlayerKeys] = useState<Set<string>>(new Set());

  // Bridge inventory (intercepted from EA's own requests)
  const bridgeInventoryRef = useRef<BridgeInventory | null>(null);

  const activeChallenge = bridgeChallenge || selectedChallenge;

  const [filters, setFilters] = useState<FilterState>({
    ratingRange: [47, 84],
    positions: [],
    nations: [],
    leagues: [],
    teams: [],
    types: [],
    multipleCopiesOnly: false,
  });

  // Load static data on mount
  useEffect(() => {
    fetchStaticData()
      .then(() => setStaticDataLoading(false))
      .catch((err) => {
        console.error('Failed to load static data:', err);
        setStaticDataLoading(false);
      });
  }, []);

  // Tampermonkey bridge: SID sync, challenge detection, push results
  useEffect(() => {
    const requestSID = () => window.dispatchEvent(new CustomEvent('SBC_REQUEST_SID'));
    const requestInventory = () => window.dispatchEvent(new CustomEvent('SBC_REQUEST_INVENTORY'));

    if ((window as unknown as Record<string, unknown>).__SBC_BRIDGE) {
      setBridgeConnected(true);
      requestSID();
      requestInventory();
    }

    const handlers: Record<string, (e: Event) => void> = {
      SBC_BRIDGE_READY: () => { setBridgeConnected(true); requestSID(); requestInventory(); },
      SBC_SID_UPDATE: (e) => {
        const newSid = (e as CustomEvent).detail?.sid;
        if (newSid) setSid(newSid);
      },
      SBC_CHALLENGE_UPDATE: (e) => {
        const d = (e as CustomEvent).detail;
        if (d?.challengeId) {
          setBridgeChallenge(prev => {
            if (prev?.challengeId !== d.challengeId) setSbcSquadPlayerKeys(new Set());
            return { challengeId: d.challengeId, challengeName: d.challengeName || 'Challenge', setName: d.setName || 'SBC', formation: d.formation || '' };
          });
        }
      },
      SBC_SQUAD_PLAYERS_UPDATE: (e) => {
        const detail = (e as CustomEvent).detail;
        if (detail?.players) {
          setSbcSquadPlayerKeys(new Set(detail.players.map((p: { assetId: number; rating: number }) => playerKey(p))));
        }
      },
      SBC_INVENTORY_UPDATE: (e) => {
        const inv = (e as CustomEvent).detail as BridgeInventory;
        if (inv) {
          bridgeInventoryRef.current = inv;
          // Auto-process players from intercepted data (no API calls!)
          processPlayersFromBridge(inv).then((result) => {
            if (result.players.length > 0) {
              setPlayers(result.players);
              setWarnings(result.warnings);

            }
          }).catch(() => {});
        }
      },
      SBC_PUSH_RESULT: (e) => {
        const detail = (e as CustomEvent).detail;
        if (detail.status === 'searching' || detail.status === 'placing') {
          setPushStatus(detail.message);
          return;
        }
        if (pushTimeoutRef.current) clearTimeout(pushTimeoutRef.current);
        setPushing(false);
        setPushStatus(null);
        setPushResult({ success: detail.success, message: detail.success ? detail.message : detail.error });
        if (detail.success && detail.status === 'done') setSelectedPlayerIds(new Set());
      },
    };

    for (const [event, handler] of Object.entries(handlers)) {
      window.addEventListener(event, handler);
    }
    return () => {
      for (const [event, handler] of Object.entries(handlers)) {
        window.removeEventListener(event, handler);
      }
      if (pushTimeoutRef.current) clearTimeout(pushTimeoutRef.current);
    };
  }, []);

  const fetchData = useCallback(async () => {
    if (!sid.trim()) return;
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const result: FetchResult = await processPlayers(sid.trim());
      setPlayers(result.players);
      setWarnings(result.warnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [sid]);

  useEffect(() => { if (sid.trim()) fetchData(); }, [sid, fetchData]);

  // Aggregate players by assetId + rating
  const aggregatedPlayers = useMemo((): AggregatedPlayer[] => {
    const map = new Map<string, AggregatedPlayer>();
    for (const p of players) {
      const key = playerKey(p);
      const existing = map.get(key);
      if (existing) {
        existing.copies += 1;
        existing.itemIds.push(p.itemId);
        if (!existing.types.includes(p.type)) existing.types.push(p.type);
      } else {
        map.set(key, { ...p, copies: 1, types: [p.type], itemIds: [p.itemId] });
      }
    }
    return Array.from(map.values());
  }, [players]);

  // Build filter dropdown options from current players
  const filterOptions = useMemo(() => {
    const build = (getVal: (p: AggregatedPlayer) => { key: string; label: string; imgUrl?: string }) => {
      const map = new Map<string, EntityOption>();
      for (const p of aggregatedPlayers) {
        const v = getVal(p);
        if (!map.has(v.key)) map.set(v.key, { value: v.key, label: v.label, imgUrl: v.imgUrl });
      }
      return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
    };
    return {
      nations: build(p => ({ key: p.nation, label: p.nation, imgUrl: p.nationImg })),
      leagues: build(p => ({ key: p.league, label: p.league, imgUrl: p.leagueImg })),
      teams: build(p => ({ key: p.team, label: p.team, imgUrl: p.teamImg })),
    };
  }, [aggregatedPlayers]);

  // Apply filters
  const filteredPlayers = useMemo(() => {
    return aggregatedPlayers
      .filter(p => {
        if (p.rating < filters.ratingRange[0] || p.rating > filters.ratingRange[1]) return false;
        if (filters.positions.length > 0 && !filters.positions.some(pos => p.position.split(' / ').includes(pos))) return false;
        if (filters.nations.length > 0 && !filters.nations.includes(p.nation)) return false;
        if (filters.leagues.length > 0 && !filters.leagues.includes(p.league)) return false;
        if (filters.teams.length > 0 && !filters.teams.includes(p.team)) return false;
        if (filters.types.length > 0 && !p.types.some(t => filters.types.includes(t))) return false;
        if (filters.multipleCopiesOnly && p.copies < 2) return false;
        if (sbcSquadPlayerKeys.size > 0 && sbcSquadPlayerKeys.has(playerKey(p))) return false;
        return true;
      })
      .sort((a, b) => b.rating - a.rating);
  }, [aggregatedPlayers, filters, sbcSquadPlayerKeys]);

  // Top stats for sidebar
  const topStats = useMemo(() => {
    const countBy = <T,>(getKey: (p: AggregatedPlayer) => string, getExtra: (p: AggregatedPlayer) => T) => {
      const map = new Map<string, { count: number; extra: T }>();
      for (const p of filteredPlayers) {
        const key = getKey(p);
        const existing = map.get(key);
        if (existing) existing.count++;
        else map.set(key, { count: 1, extra: getExtra(p) });
      }
      return Array.from(map.entries())
        .map(([name, { count, extra }]) => ({ name, count, ...(extra as object) }))
        .sort((a, b) => b.count - a.count) as TopItem[];
    };

    return {
      topClubs: countBy(p => p.team, p => ({ imgUrl: p.teamImg })),
      topNations: countBy(p => p.nation, p => ({ imgUrl: p.nationImg })),
      topLeagues: countBy(p => p.league, p => ({ imgUrl: p.leagueImg })),
      topPositions: (() => {
        const map = new Map<string, number>();
        for (const p of filteredPlayers) {
          for (const pos of p.position.split(' / ')) {
            map.set(pos.trim(), (map.get(pos.trim()) || 0) + 1);
          }
        }
        return Array.from(map.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);
      })(),
    };
  }, [filteredPlayers]);

  const uniquePlayersCount = filteredPlayers.length;
  const totalCardsCount = filteredPlayers.reduce((sum, p) => sum + p.copies, 0);
  const avgRating = filteredPlayers.length > 0
    ? Math.round(filteredPlayers.reduce((sum, p) => sum + p.rating * p.copies, 0) / totalCardsCount)
    : 0;
  const duplicatesCount = filteredPlayers.filter(p => p.copies > 1).reduce((sum, p) => sum + (p.copies - 1), 0);

  // Selection handlers
  const togglePlayerSelection = useCallback((key: string) => {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev);
      for (const p of filteredPlayers) next.add(playerKey(p));
      return next;
    });
  }, [filteredPlayers]);

  const deselectAll = useCallback(() => setSelectedPlayerIds(new Set()), []);

  const selectedPlayersSummary = useMemo(() => {
    return filteredPlayers.filter(p => selectedPlayerIds.has(playerKey(p)));
  }, [filteredPlayers, selectedPlayerIds]);

  // Build slot data from selected players for push commands
  const buildSlotData = useCallback(() => {
    const slotData: Record<number, { a: number; r: number; p: string[]; n: number; l: number; t: number; nm: string }> = {};
    let idx = 0;
    for (const p of filteredPlayers) {
      if (selectedPlayerIds.has(playerKey(p))) {
        slotData[idx++] = { a: p.assetId, r: p.rating, p: p.position.split(' / '), n: p.nationId, l: p.leagueId, t: p.teamId, nm: p.name };
      }
    }
    return slotData;
  }, [filteredPlayers, selectedPlayerIds]);

  const handleCopyFetchCommand = useCallback(() => {
    if (!activeChallenge || selectedPlayerIds.size === 0 || !sid.trim()) return;

    const url = `https://utas.mob.v5.prd.futc-ext.gcp.ea.com/ut/game/fc26/sbs/challenge/${activeChallenge.challengeId}/squad`;
    const slotData: Record<number, { a: number; r: number }> = {};
    let idx = 0;
    for (const p of filteredPlayers) {
      if (selectedPlayerIds.has(playerKey(p))) {
        slotData[idx++] = { a: p.assetId, r: p.rating };
      }
    }

    const fetchCmd = `(async function(){try{var S=${JSON.stringify(slotData)};var sid="${sid.trim()}";var sUrl="${url}";var cUrl="https://utas.mob.v5.prd.futc-ext.gcp.ea.com/ut/game/fc26/club";var h={"X-UT-SID":sid,"Content-Type":"application/json"};var nc={};for(var s in S){var p=S[s];var k=p.a+"_"+p.r;nc[k]=(nc[k]||0)+1}var cf={};var ratings={};for(var k in nc){var r=parseInt(k.split("_")[1]);ratings[r]=true}console.log("Searching club at "+Object.keys(ratings).length+" rating level(s)...");for(var rv in ratings){var r=parseInt(rv);var st=0;while(true){var resp=await fetch(cUrl,{method:"POST",headers:h,referrer:"https://www.ea.com/",body:JSON.stringify({type:"player",count:90,start:st,ovrMin:r,ovrMax:r,sort:"desc",sortBy:"ovr",searchAltPositions:true}),mode:"cors",credentials:"omit"});if(!resp.ok){alert("Club search failed: "+resp.status);return}var d=await resp.json();var it=d.itemData||[];if(it.length===0)break;for(var i=0;i<it.length;i++){var item=it[i];var ik=item.assetId+"_"+r;if(nc[ik]!==undefined){if(!cf[ik])cf[ik]=[];if(cf[ik].length<nc[ik])cf[ik].push(item.id)}}var allOk=true;for(var ck in nc){if(parseInt(ck.split("_")[1])===r){if(!cf[ck]||cf[ck].length<nc[ck]){allOk=false;break}}}if(allOk)break;st+=it.length}}var si={};var u={};var mi=[];for(var s in S){var p=S[s];var k=p.a+"_"+p.r;var x=u[k]||0;if(cf[k]&&cf[k][x]){si[s]=cf[k][x];u[k]=x+1}else{mi.push(p.a+" ("+p.r+")")}}if(mi.length>0){alert("Not in club: "+mi.join(", ")+"\\nMove from transfer list to club first.");return}console.log("Found all players. Placing into SBC...");var g1=await fetch(sUrl,{headers:{"X-UT-SID":sid},referrer:"https://www.ea.com/"});var cu=await g1.json();var ex=cu.squad.players.map(function(p){return{index:p.index,itemData:{id:p.itemData.id,dream:false}}});for(var s in si){ex[parseInt(s)].itemData.id=si[s]}var pr=await fetch(sUrl,{headers:{"Content-Type":"application/json","X-UT-SID":sid},referrer:"https://www.ea.com/",body:JSON.stringify({players:ex}),method:"PUT",mode:"cors",credentials:"omit"});if(!pr.ok){alert("PUT failed: "+pr.status);return}var g2=await fetch(sUrl,{headers:{"X-UT-SID":sid},referrer:"https://www.ea.com/"});var fd=await g2.json();var sp=fd.squad.players.filter(function(p){return p.itemData.id>0});var factory=new UTItemEntityFactory();var sq=services.SBC.getCachedSBCSquads()[0];if(!sq){alert("No cached SBC squad found. Make sure you have the challenge open.");return}var added=0;for(var j=0;j<sp.length;j++){var p=sp[j];var item=factory.createItem(p.itemData);sq.addItemToSlot(p.index,item);added++}alert("Done! "+added+" players added.\\nRating: "+(fd.squad.rating||0)+", Chemistry: "+(fd.squad.chemistry||0))}catch(e){alert("Failed: "+e.message)}})()`;

    navigator.clipboard.writeText(fetchCmd).then(() => {
      setPushResult({ success: true, message: 'Copied! Paste in EA web app console (F12).' });
    }).catch(() => {
      setPushResult({ success: true, message: fetchCmd });
    });
  }, [activeChallenge, selectedPlayerIds, filteredPlayers, sid]);

  const handlePushToSBC = useCallback(() => {
    if (!activeChallenge || selectedPlayerIds.size === 0 || !sid.trim()) return;

    setPushing(true);
    setPushStatus('Sending command...');
    setPushResult(null);

    window.dispatchEvent(new CustomEvent('SBC_PUSH_COMMAND', {
      detail: { challengeId: activeChallenge.challengeId, sid: sid.trim(), slotData: buildSlotData() },
    }));

    if (pushTimeoutRef.current) clearTimeout(pushTimeoutRef.current);
    pushTimeoutRef.current = setTimeout(() => {
      setPushing(false);
      setPushStatus(null);
      setPushResult({ success: false, message: 'Push timed out. Make sure the EA Web App is open with the SBC challenge visible.' });
    }, 30000);
  }, [activeChallenge, selectedPlayerIds, sid, buildSlotData]);

  if (staticDataLoading) {
    return (
      <Center h="100vh">
        <Stack align="center">
          <LoadingOverlay visible={true} />
          <Text c="dimmed">Loading player database...</Text>
        </Stack>
      </Center>
    );
  }

  const renderEntitySelect = (placeholder: string, data: EntityOption[], value: string[], key: keyof FilterState) => (
    <MultiSelect
      placeholder={placeholder}
      data={data}
      value={value}
      onChange={(v) => setFilters(prev => ({ ...prev, [key]: v }))}
      searchable
      clearable
      size="xs"
      renderOption={({ option }) => {
        const opt = option as EntityOption;
        return <EntityWithImage name={opt.label} imgUrl={opt.imgUrl} />;
      }}
    />
  );

  return (
    <AppShell header={{ height: 60 }} padding="sm">
      <AppShell.Header>
        <Flex h="100%" align="center" justify="space-between" px="xs" gap="xs">
          <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
            <Image src="/vite.svg" w={24} h={24} />
            <Title order={4} style={{ color: '#228be6' }} visibleFrom="sm">FC SBC Optimizer</Title>
          </Group>

          <Group gap={4} wrap="nowrap" style={{ flex: 1, justifyContent: 'flex-end' }}>
            <TextInput
              placeholder={bridgeConnected ? 'Auto-synced' : 'X-UT-SID...'}
              value={sid}
              onChange={(e) => setSid(e.target.value)}
              style={{ flex: 1, maxWidth: 260, minWidth: 100 }}
              size="xs"
              styles={{ input: { fontFamily: 'monospace', fontSize: '0.7rem' } }}
            />
            <Tooltip label={bridgeConnected ? 'Sync SID & challenge from EA' : 'No bridge connected'}>
              <ActionIcon
                variant="light"
                color={bridgeConnected ? 'green' : 'gray'}
                size="sm"
                onClick={bridgeConnected ? () => {
                  window.dispatchEvent(new CustomEvent('SBC_REFRESH_SID'));
                  window.dispatchEvent(new CustomEvent('SBC_REQUEST_CHALLENGE'));
                  window.dispatchEvent(new CustomEvent('SBC_REQUEST_INVENTORY'));
                } : undefined}
                disabled={!bridgeConnected}
              >
                {bridgeConnected ? <IconPlugConnected size={14} /> : <IconPlugConnectedX size={14} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Refresh player data">
              <ActionIcon variant="filled" color="blue" size="sm" onClick={fetchData} loading={loading} disabled={!sid.trim()}>
                <IconRefresh size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Flex>
      </AppShell.Header>

      <AppShell.Main>
        <Box px="sm">
          {!sid.trim() ? (
            <Center h={400}>
              <Paper p="xl" radius="md" withBorder>
                <Stack align="center" gap="lg">
                  <IconPlayerPause size={64} color="gray" />
                  <Title order={3} c="dimmed">Waiting for Session ID</Title>
                  <Text c="dimmed" size="sm" maw={400} ta="center">
                    Enter your X-UT-SID session token in the header to load your FIFA Ultimate Team data.
                    The session ID can be found in your browser's network requests when using the FUT Web App.
                  </Text>
                </Stack>
              </Paper>
            </Center>
          ) : (
            <Grid gutter="sm">
              {/* Left side - Filters and Table */}
              <Grid.Col span={{ base: 12, lg: 8.5 }}>
                <Stack gap="sm">
                  {error && (
                    <Alert icon={<IconAlertCircle size={14} />} title="Error" color="red" withCloseButton onClose={() => setError(null)} py="xs">
                      {error}
                    </Alert>
                  )}

                  {warnings.length > 0 && (
                    <Alert icon={<IconAlertTriangle size={14} />} title="Warning" color="yellow" withCloseButton onClose={() => setWarnings([])} py="xs">
                      <Stack gap={2}>
                        {warnings.map((w, i) => <Text key={i} size="xs">{w}</Text>)}
                      </Stack>
                    </Alert>
                  )}

                  {/* Filters */}
                  <Paper p="xs" radius="sm" withBorder>
                    <Stack gap={4}>
                      <Group justify="space-between">
                        <Group gap="xs">
                          <Title order={6}>Filters</Title>
                          <Checkbox
                            label="Dupes only"
                            checked={filters.multipleCopiesOnly}
                            onChange={(e) => setFilters(prev => ({ ...prev, multipleCopiesOnly: e.target.checked }))}
                            size="xs"
                          />
                        </Group>
                        <Button
                          variant="subtle"
                          size="compact-xs"
                          onClick={() => setFilters({ ratingRange: [47, 99], positions: [], nations: [], leagues: [], teams: [], types: [], multipleCopiesOnly: false })}
                        >
                          Clear
                        </Button>
                      </Group>

                      <Group gap="xs" align="flex-end" wrap="nowrap">
                        <Box style={{ flex: 1, minWidth: 120 }} pb={4}>
                          <RangeSlider min={47} max={99} step={1} size="xs" label={(val) => val} value={filters.ratingRange} onChange={(value) => setFilters(prev => ({ ...prev, ratingRange: value }))} />
                        </Box>
                        <MultiSelect placeholder="Pos" data={ALL_POSITIONS} value={filters.positions} onChange={(v) => setFilters(prev => ({ ...prev, positions: v }))} searchable clearable size="xs" style={{ flex: 1, minWidth: 80, maxWidth: 160 }} />
                        <MultiSelect placeholder="Type" data={PLAYER_TYPES} value={filters.types} onChange={(v) => setFilters(prev => ({ ...prev, types: v as typeof PLAYER_TYPES }))} clearable size="xs" style={{ flex: 1, minWidth: 80, maxWidth: 140 }} />
                      </Group>

                      <SimpleGrid cols={3} spacing="xs">
                        {renderEntitySelect('Nation', filterOptions.nations, filters.nations, 'nations')}
                        {renderEntitySelect('League', filterOptions.leagues, filters.leagues, 'leagues')}
                        {renderEntitySelect('Team', filterOptions.teams, filters.teams, 'teams')}
                      </SimpleGrid>
                    </Stack>
                  </Paper>

                  {/* SBC Push Control */}
                  <Paper p="xs" radius="sm" withBorder style={activeChallenge ? { borderColor: 'var(--mantine-color-blue-8)' } : undefined}>
                    <Stack gap={4}>
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                          {activeChallenge ? (
                            <>
                              <IconTarget size={14} color="var(--mantine-color-blue-4)" style={{ flexShrink: 0 }} />
                              {bridgeChallenge && activeChallenge === bridgeChallenge && (
                                <Badge size="xs" variant="light" color="green" style={{ flexShrink: 0 }}>auto</Badge>
                              )}
                              <Text size="xs" fw={600} c="blue.3" truncate>
                                {activeChallenge.setName} &rarr; {activeChallenge.challengeName}
                              </Text>
                              {activeChallenge.formation && (
                                <Badge size="xs" variant="light" color="blue" style={{ flexShrink: 0 }}>
                                  {activeChallenge.formation.replace('f', '')}
                                </Badge>
                              )}
                            </>
                          ) : (
                            <>
                              <IconTarget size={14} color="var(--mantine-color-dark-3)" style={{ flexShrink: 0 }} />
                              <Text size="xs" c="dimmed" truncate>
                                {bridgeConnected ? 'Open an SBC in EA app or click sync' : 'Select a challenge from the SBC list'}
                              </Text>
                            </>
                          )}
                        </Group>
                        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                          <Button size="compact-xs" variant="light" onClick={selectAllFiltered}>All</Button>
                          <Button size="compact-xs" variant="subtle" color="gray" onClick={deselectAll} disabled={selectedPlayerIds.size === 0}>Clear</Button>
                          {bridgeConnected ? (
                            <Button size="compact-xs" color="green" leftSection={<IconSend size={12} />} onClick={handlePushToSBC} disabled={!activeChallenge || selectedPlayerIds.size === 0 || pushing} loading={pushing}>
                              {pushStatus || 'Push'}
                            </Button>
                          ) : (
                            <Button size="compact-xs" color="green" leftSection={<IconSend size={12} />} onClick={handleCopyFetchCommand} disabled={!activeChallenge || selectedPlayerIds.size === 0}>
                              Copy
                            </Button>
                          )}
                        </Group>
                      </Group>
                      {selectedPlayersSummary.length > 0 && (
                        <Group gap={4} wrap="wrap">
                          {selectedPlayersSummary.map(p => (
                            <Badge
                              key={playerKey(p)}
                              size="xs"
                              variant="light"
                              color="green"
                              style={{ cursor: 'pointer' }}
                              onClick={() => togglePlayerSelection(playerKey(p))}
                              rightSection={<Text size="8px" c="dimmed" span>&times;</Text>}
                            >
                              {p.name} {p.rating}
                            </Badge>
                          ))}
                        </Group>
                      )}
                    </Stack>
                  </Paper>

                  {pushResult && (
                    <Alert color={pushResult.success ? 'green' : 'red'} withCloseButton onClose={() => setPushResult(null)} py="xs">
                      <Text size="xs">{pushResult.message}</Text>
                    </Alert>
                  )}

                  {/* Player Table */}
                  <Paper p="xs" radius="sm" withBorder pos="relative" style={{ flex: 1 }}>
                    <LoadingOverlay visible={loading} />
                    <Table.ScrollContainer minWidth={400}>
                      <Table striped highlightOnHover horizontalSpacing={4} verticalSpacing={3} fz="xs" layout="fixed">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th style={{ width: '30%' }}>Player</Table.Th>
                            <Table.Th style={{ width: 50, textAlign: 'center' }}>Rtg</Table.Th>
                            <Table.Th style={{ width: '35%' }}>Pos</Table.Th>
                            <Table.Th style={{ width: '30%' }}>Club / League</Table.Th>
                            <Table.Th style={{ width: 40, textAlign: 'center' }}>#</Table.Th>
                            <Table.Th style={{ width: 60, textAlign: 'center' }}>Src</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {filteredPlayers.length === 0 ? (
                            <Table.Tr>
                              <Table.Td colSpan={6}>
                                <Text ta="center" c="dimmed" py="md" size="sm">
                                  {players.length === 0 ? 'No players loaded' : 'No players match the current filters'}
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          ) : (
                            filteredPlayers.map((p, index) => {
                              const key = playerKey(p);
                              const isSelected = selectedPlayerIds.has(key);
                              return (
                                <Table.Tr
                                  key={`${key}-${index}`}
                                  style={{
                                    cursor: 'pointer',
                                    background: isSelected ? 'var(--mantine-color-green-9)' : undefined,
                                    borderLeft: isSelected ? '3px solid var(--mantine-color-green-5)' : '3px solid transparent',
                                  }}
                                  onClick={() => togglePlayerSelection(key)}
                                >
                                  <Table.Td>
                                    <Group gap={4} wrap="nowrap">
                                      {p.nationImg && <Image src={p.nationImg} w={14} h={14} fit="contain" style={{ flexShrink: 0 }} fallbackSrc="https://placehold.co/14x14?text=-" />}
                                      <Text size="xs" fw={isSelected ? 700 : 500} truncate>{p.name}</Text>
                                    </Group>
                                  </Table.Td>
                                  <Table.Td style={{ textAlign: 'center' }}>
                                    <Badge size="xs" variant="filled" style={{ backgroundColor: getRatingGradientColor(p.rating), minWidth: 28 }}>{p.rating}</Badge>
                                  </Table.Td>
                                  <Table.Td><Text size="10px" c="dimmed">{p.position}</Text></Table.Td>
                                  <Table.Td>
                                    <Stack gap={0}>
                                      <Group gap={4} wrap="nowrap">
                                        {p.teamImg && <Image src={p.teamImg} w={12} h={12} fit="contain" style={{ flexShrink: 0 }} fallbackSrc="https://placehold.co/12x12?text=-" />}
                                        <Text size="10px" truncate>{p.team}</Text>
                                      </Group>
                                      <Group gap={4} wrap="nowrap">
                                        {p.leagueImg && <Image src={p.leagueImg} w={12} h={12} fit="contain" style={{ flexShrink: 0 }} fallbackSrc="https://placehold.co/12x12?text=-" />}
                                        <Text size="10px" c="dimmed" truncate>{p.league}</Text>
                                      </Group>
                                    </Stack>
                                  </Table.Td>
                                  <Table.Td style={{ textAlign: 'center' }}>
                                    {p.copies > 1 ? <Badge size="xs" variant="filled" color="orange">{p.copies}</Badge> : <Text size="10px" c="dimmed">1</Text>}
                                  </Table.Td>
                                  <Table.Td style={{ textAlign: 'center' }}>
                                    <Group gap={1} justify="center">
                                      {p.types.map(type => (
                                        <Box key={type} w={8} h={8} style={{ borderRadius: '50%', backgroundColor: `var(--mantine-color-${TYPE_COLORS[type] || 'gray'}-6)` }} title={type} />
                                      ))}
                                    </Group>
                                  </Table.Td>
                                </Table.Tr>
                              );
                            })
                          )}
                        </Table.Tbody>
                      </Table>
                    </Table.ScrollContainer>
                  </Paper>
                </Stack>
              </Grid.Col>

              {/* Right side - Stats Panel */}
              <Grid.Col span={{ base: 12, lg: 3.5 }}>
                <Stack gap="sm">
                  <SimpleGrid cols={2} spacing="xs">
                    <AnimatedCounter value={uniquePlayersCount} label="Players" icon={<IconUsers size={16} />} color="blue" />
                    <AnimatedCounter value={totalCardsCount} label="Cards" icon={<IconCards size={16} />} color="green" />
                    <AnimatedCounter value={avgRating} label="Avg Rtg" icon={<IconTrophy size={16} />} color="yellow" />
                    <AnimatedCounter value={duplicatesCount} label="Dupes" icon={<IconShirt size={16} />} color="orange" />
                  </SimpleGrid>

                  <SimpleGrid cols={2} spacing="xs">
                    <RatingDistributionChart players={filteredPlayers} />
                    <TypeDistributionChart players={filteredPlayers} />
                  </SimpleGrid>

                  <SimpleGrid cols={2} spacing="xs">
                    <PaginatedTopList title="🏆 Top Clubs" items={topStats.topClubs} color="blue" maxCount={topStats.topClubs[0]?.count || 1} />
                    <PaginatedTopList title="🌍 Top Nations" items={topStats.topNations} color="green" maxCount={topStats.topNations[0]?.count || 1} />
                    <PaginatedTopList title="⚽ Top Leagues" items={topStats.topLeagues} color="violet" maxCount={topStats.topLeagues[0]?.count || 1} />
                    <PaginatedTopList title="📍 Top Positions" items={topStats.topPositions} color="orange" maxCount={topStats.topPositions[0]?.count || 1} />
                  </SimpleGrid>

                  <SBCList sid={sid} onChallengeSelect={setSelectedChallenge} selectedChallenge={selectedChallenge} />
                </Stack>
              </Grid.Col>
            </Grid>
          )}
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}

export default App;
