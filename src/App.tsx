import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  AppShell,
  Title,
  Text,
  Group,
  Stack,
  TextInput,
  Button,
  Paper,
  Table,
  Badge,
  MultiSelect,
  RangeSlider,
  Checkbox,
  LoadingOverlay,
  Alert,
  Box,
  Flex,
  Center,
  ActionIcon,
  Tooltip,
  Image,
  Grid,
  Progress,
  RingProgress,
  ThemeIcon,
  SimpleGrid,
} from '@mantine/core';
import type { ComboboxItem } from '@mantine/core';
import {
  IconRefresh,
  IconAlertCircle,
  IconPlayerPause,
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconUsers,
  IconCards,
  IconTrophy,
  IconShirt,
  IconThumbUp,
  IconThumbDown,
  IconLoader,
} from '@tabler/icons-react';
import {
  fetchStaticData,
  fetchAllSBCsWithDetails,
  fetchSBCSetChallengeDetails,
  processPlayers,
} from './services/api';
import type { FetchResult, SBCWithDetails, SBCChallengeDetail } from './services/api';
import type { ProcessedPlayer, AggregatedPlayer, FilterState } from './types/player';
import './App.css';

const ALL_POSITIONS = [
  'GK', 'CB', 'LB', 'RB',
  'CDM', 'CM', 'CAM', 'LM', 'RM',
  'LW', 'RW', 'ST'
];

const PLAYER_TYPES: ('Transfer' | 'Storage' | 'Duplicated')[] = ['Transfer', 'Storage', 'Duplicated'];

const IMG_SIZE = 18;
const STATS_IMG_SIZE = 20;

interface EntityOption extends ComboboxItem {
  value: string;
  label: string;
  imgUrl?: string;
}

interface TopItem {
  name: string;
  count: number;
  imgUrl?: string;
}

function EntityWithImage({ name, imgUrl, size = IMG_SIZE }: { name: string; imgUrl?: string; size?: number }) {
  return (
    <Group gap={4} wrap="nowrap">
      {imgUrl && (
        <Image
          src={imgUrl}
          w={size}
          h={size}
          fit="contain"
          fallbackSrc={`https://placehold.co/${size}x${size}?text=-`}
        />
      )}
      <Text size="xs" truncate>{name}</Text>
    </Group>
  );
}

function AnimatedCounter({ value, label, icon, color }: { value: number; label: string; icon: React.ReactNode; color: string }) {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValueRef = useRef(0);

  useEffect(() => {
    const startValue = prevValueRef.current;
    const endValue = value;
    const duration = 500;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(startValue + (endValue - startValue) * easeOut);
      setDisplayValue(currentValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
    prevValueRef.current = value;
  }, [value]);

  return (
    <Paper p="xs" radius="sm" withBorder>
      <Group gap="xs" wrap="nowrap">
        <ThemeIcon size="md" radius="sm" variant="light" color={color}>
          {icon}
        </ThemeIcon>
        <Box>
          <Text size="md" fw={700} lh={1.1}>{displayValue.toLocaleString()}</Text>
          <Text size="xs" c="dimmed" lh={1}>{label}</Text>
        </Box>
      </Group>
    </Paper>
  );
}

function PaginatedTopList({
  title,
  items,
  color,
  maxCount,
}: {
  title: string;
  items: TopItem[];
  color: string;
  maxCount: number;
}) {
  const [page, setPage] = useState(0);
  const pageSize = 5;
  const totalPages = Math.ceil(items.length / pageSize);
  const currentItems = items.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => {
    setPage(0);
  }, [items]);

  return (
    <Paper p="xs" radius="sm" withBorder>
      <Group justify="space-between" mb={4}>
        <Text size="xs" fw={600}>{title}</Text>
        {totalPages > 1 && (
          <Group gap={2}>
            <ActionIcon
              size="xs"
              variant="subtle"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              <IconChevronLeft size={12} />
            </ActionIcon>
            <Text size="xs" c="dimmed">{page + 1}/{totalPages}</Text>
            <ActionIcon
              size="xs"
              variant="subtle"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              <IconChevronRight size={12} />
            </ActionIcon>
          </Group>
        )}
      </Group>
      <Stack gap={4}>
        {currentItems.length === 0 ? (
          <Text size="xs" c="dimmed" ta="center">No data</Text>
        ) : (
          currentItems.map((item, index) => (
            <Box key={item.name}>
              <Group justify="space-between" mb={2} wrap="nowrap">
                <Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                  {item.imgUrl && (
                    <Image
                      src={item.imgUrl}
                      w={STATS_IMG_SIZE}
                      h={STATS_IMG_SIZE}
                      fit="contain"
                      fallbackSrc={`https://placehold.co/${STATS_IMG_SIZE}x${STATS_IMG_SIZE}?text=-`}
                    />
                  )}
                  <Text size="xs" truncate style={{ flex: 1 }}>
                    {page * pageSize + index + 1}. {item.name}
                  </Text>
                </Group>
                <Badge size="xs" variant="light" color={color}>{item.count}</Badge>
              </Group>
              <Progress
                value={(item.count / maxCount) * 100}
                size={3}
                color={color}
                radius="xl"
              />
            </Box>
          ))
        )}
      </Stack>
    </Paper>
  );
}

function RatingDistributionChart({ players }: { players: AggregatedPlayer[] }) {
  const distribution = useMemo(() => {
    const ranges = [
      { label: '87+', min: 87, max: 99, color: 'green' },
      { label: '84-86', min: 84, max: 86, color: 'violet' },
      { label: '≤83', min: 0, max: 83, color: 'yellow' },
    ];

    return ranges.map(range => ({
      ...range,
      count: players.filter(p => p.rating >= range.min && p.rating <= range.max).length,
    }));
  }, [players]);

  const total = distribution.reduce((sum, r) => sum + r.count, 0);

  if (total === 0) {
    return (
      <Paper p="xs" radius="sm" withBorder>
        <Text size="xs" fw={600} mb={4}>Rating Distribution</Text>
        <Text size="xs" c="dimmed" ta="center">No data</Text>
      </Paper>
    );
  }

  return (
    <Paper p="xs" radius="sm" withBorder>
      <Text size="xs" fw={600} mb={4}>Rating Distribution</Text>
      <Flex align="center" gap="xs">
        <RingProgress
          size={80}
          thickness={10}
          roundCaps
          sections={distribution.map(d => ({
            value: (d.count / total) * 100,
            color: d.color,
            tooltip: `${d.label}: ${d.count}`,
          }))}
        />
        <Stack gap={2} style={{ flex: 1 }}>
          {distribution.map(d => (
            <Group key={d.label} justify="space-between" wrap="nowrap">
              <Group gap={4} wrap="nowrap">
                <Box w={8} h={8} style={{ backgroundColor: `var(--mantine-color-${d.color}-6)`, borderRadius: 2 }} />
                <Text size="xs">{d.label}</Text>
              </Group>
              <Text size="xs" c="dimmed">{d.count}</Text>
            </Group>
          ))}
        </Stack>
      </Flex>
    </Paper>
  );
}

function TypeDistributionChart({ players }: { players: AggregatedPlayer[] }) {
  const distribution = useMemo(() => {
    const counts = { Transfer: 0, Storage: 0, Duplicated: 0 };
    players.forEach(p => {
      p.types.forEach(type => {
        counts[type] += p.copies;
      });
    });
    return [
      { type: 'Transfer', count: counts.Transfer, color: 'blue' },
      { type: 'Storage', count: counts.Storage, color: 'green' },
      { type: 'Duplicated', count: counts.Duplicated, color: 'red' },
    ];
  }, [players]);

  const total = distribution.reduce((sum, d) => sum + d.count, 0);

  return (
    <Paper p="xs" radius="sm" withBorder>
      <Text size="xs" fw={600} mb={4}>Cards by Location</Text>
      <Stack gap={4}>
        {distribution.map(d => (
          <Box key={d.type}>
            <Group justify="space-between" mb={2} wrap="nowrap">
              <Text size="xs">{d.type}</Text>
              <Text size="xs" c="dimmed">{d.count}</Text>
            </Group>
            <Progress
              value={total > 0 ? (d.count / total) * 100 : 0}
              size={4}
              color={d.color}
              radius="xl"
            />
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

function SBCList({ sid }: { sid: string }) {
  const [sbcs, setSbcs] = useState<SBCWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const fetchingRef = useRef(false);

  // Navigation state for drill-down
  const [selectedSet, setSelectedSet] = useState<{ setId: number; name: string } | null>(null);
  const [challenges, setChallenges] = useState<SBCChallengeDetail[]>([]);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [challengesError, setChallengesError] = useState<string | null>(null);

  useEffect(() => {
    if (!sid.trim()) {
      setSbcs([]);
      setLoading(false);
      return;
    }

    if (fetchingRef.current) {
      return;
    }

    let cancelled = false;

    const loadSBCs = async () => {
      fetchingRef.current = true;
      try {
        setLoading(true);
        setError(null);
        const data = await fetchAllSBCsWithDetails(sid);
        if (!cancelled) {
          setSbcs(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load SBCs');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
        fetchingRef.current = false;
      }
    };

    loadSBCs();

    return () => {
      cancelled = true;
      fetchingRef.current = false;
    };
  }, [sid]);

  const handleSBCClick = async (setId: number, name: string) => {
    setSelectedSet({ setId, name });
    setChallengesLoading(true);
    setChallengesError(null);

    try {
      const challengeDetails = await fetchSBCSetChallengeDetails(sid, setId);
      setChallenges(challengeDetails);
    } catch (err) {
      setChallengesError(err instanceof Error ? err.message : 'Failed to load challenges');
    } finally {
      setChallengesLoading(false);
    }
  };

  const handleBackClick = () => {
    setSelectedSet(null);
    setChallenges([]);
    setChallengesError(null);
  };

  const totalPages = Math.ceil(sbcs.length / pageSize);
  const currentSBCs = sbcs.slice(page * pageSize, (page + 1) * pageSize);

  if (!sid.trim()) {
    return (
      <Paper p="xs" radius="sm" withBorder>
        <Group justify="space-between" mb="xs">
          <Text size="xs" fw={600}>🎯 Live SBCs</Text>
        </Group>
        <Text size="xs" c="dimmed" ta="center" py="md">Enter SID to load SBCs</Text>
      </Paper>
    );
  }

  if (loading) {
    return (
      <Paper p="xs" radius="sm" withBorder>
        <Group justify="space-between" mb="xs">
          <Text size="xs" fw={600}>🎯 Live SBCs</Text>
        </Group>
        <Center py="md">
          <Group gap="xs">
            <IconLoader size={16} className="spin" />
            <Text size="xs" c="dimmed">Loading SBCs...</Text>
          </Group>
        </Center>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper p="xs" radius="sm" withBorder>
        <Group justify="space-between" mb="xs">
          <Text size="xs" fw={600}>🎯 Live SBCs</Text>
        </Group>
        <Alert color="red" variant="light" title="Error" icon={<IconAlertCircle size={14} />}>
          <Text size="xs">{error}</Text>
        </Alert>
      </Paper>
    );
  }

  // Show challenge details view when a set is selected
  if (selectedSet) {
    return (
      <Paper p="xs" radius="sm" withBorder>
        <Group justify="space-between" mb="xs">
          <Group gap="xs">
            <ActionIcon
              size="xs"
              variant="subtle"
              onClick={handleBackClick}
            >
              <IconChevronLeft size={14} />
            </ActionIcon>
            <Text size="xs" fw={600} truncate style={{ maxWidth: 180 }}>
              {selectedSet.name}
            </Text>
          </Group>
        </Group>

        {challengesLoading ? (
          <Center py="md">
            <Group gap="xs">
              <IconLoader size={16} className="spin" />
              <Text size="xs" c="dimmed">Loading challenges...</Text>
            </Group>
          </Center>
        ) : challengesError ? (
          <Alert color="red" variant="light" title="Error" icon={<IconAlertCircle size={14} />}>
            <Text size="xs">{challengesError}</Text>
          </Alert>
        ) : (
          <Table.ScrollContainer minWidth={200}>
            <Table striped highlightOnHover withTableBorder withColumnBorders verticalSpacing={2} horizontalSpacing={4} layout="fixed">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ fontSize: '10px', width: '50%' }}>Challenge</Table.Th>
                  <Table.Th style={{ fontSize: '10px', textAlign: 'center', width: '25%' }}>Formation</Table.Th>
                  <Table.Th style={{ fontSize: '10px', textAlign: 'center', width: '25%' }}>Rating</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {challenges.map(challenge => (
                  <Table.Tr key={challenge.challengeId}>
                    <Table.Td>
                      <Text size="xs" truncate>{challenge.name}</Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'center' }}>
                      <Text size="xs">{challenge.formation.replace('f', '')}</Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'center' }}>
                      <Text size="xs" c={challenge.teamRating ? 'blue' : 'dimmed'}>
                        {challenge.teamRating ?? '-'}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
    );
  }

  return (
    <Paper p="xs" radius="sm" withBorder>
      <Group justify="space-between" mb="xs">
        <Text size="xs" fw={600}>🎯 Live SBCs ({sbcs.length})</Text>
        {totalPages > 1 && (
          <Group gap={2}>
            <ActionIcon
              size="xs"
              variant="subtle"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              <IconChevronLeft size={12} />
            </ActionIcon>
            <Text size="xs" c="dimmed">{page + 1}/{totalPages}</Text>
            <ActionIcon
              size="xs"
              variant="subtle"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              <IconChevronRight size={12} />
            </ActionIcon>
          </Group>
        )}
      </Group>
      <Table.ScrollContainer minWidth={200}>
        <Table striped highlightOnHover withTableBorder withColumnBorders verticalSpacing={2} horizontalSpacing={4} layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ fontSize: '10px', width: '45%' }}>SBC Name</Table.Th>
              <Table.Th style={{ fontSize: '10px', textAlign: 'center', width: '14%' }}>
                <Group gap={2} justify="center">
                  <IconThumbUp size={10} color="green" />
                </Group>
              </Table.Th>
              <Table.Th style={{ fontSize: '10px', textAlign: 'center', width: '14%' }}>
                <Group gap={2} justify="center">
                  <IconThumbDown size={10} color="red" />
                </Group>
              </Table.Th>
              <Table.Th style={{ fontSize: '10px', textAlign: 'center', width: '14%' }}>%</Table.Th>
              <Table.Th style={{ fontSize: '10px', textAlign: 'center', width: '13%' }}>#</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {currentSBCs.map(sbc => (
              <Table.Tr
                key={sbc.setId}
                style={{ cursor: 'pointer' }}
                onClick={() => handleSBCClick(sbc.setId, sbc.name)}
              >
                <Table.Td>
                  <Text size="xs" truncate>{sbc.name}</Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'center' }}>
                  <Text size="xs" c="green">{sbc.likes}</Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'center' }}>
                  <Text size="xs" c="red">{sbc.dislikes}</Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'center' }}>
                  <Text
                    size="xs"
                    c={sbc.likePercent >= 70 ? 'green' : sbc.likePercent >= 50 ? 'yellow' : 'red'}
                  >
                    {sbc.likePercent.toFixed(0)}%
                  </Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'center' }}>
                  <Text size="xs" c="blue">{sbc.challengesCount}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );
}

function App() {
  const [sid, setSid] = useState<string>('');
  const [players, setPlayers] = useState<ProcessedPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [staticDataLoading, setStaticDataLoading] = useState(true);

  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [filters, setFilters] = useState<FilterState>({
    ratingRange: [47, 99],
    positions: [],
    nations: [],
    leagues: [],
    teams: [],
    types: [],
    multipleCopiesOnly: false,
  });

  useEffect(() => {
    fetchStaticData()
      .then(() => setStaticDataLoading(false))
      .catch((err) => {
        console.error('Failed to load static data:', err);
        setStaticDataLoading(false);
      });
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
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [sid]);

  useEffect(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    if (sid.trim()) {
      refreshIntervalRef.current = setInterval(fetchData, 60000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [sid, fetchData]);

  useEffect(() => {
    if (sid.trim()) {
      fetchData();
    }
  }, [sid, fetchData]);

  const aggregatedPlayers = useMemo((): AggregatedPlayer[] => {
    const playerMap = new Map<string, AggregatedPlayer>();

    for (const player of players) {
      const key = `${player.assetId}-${player.rating}`;
      const existing = playerMap.get(key);

      if (existing) {
        existing.copies += 1;
        if (!existing.types.includes(player.type)) {
          existing.types.push(player.type);
        }
      } else {
        playerMap.set(key, {
          ...player,
          copies: 1,
          types: [player.type],
        });
      }
    }

    return Array.from(playerMap.values());
  }, [players]);

  const filterOptions = useMemo(() => {
    const nationMap = new Map<string, EntityOption>();
    const leagueMap = new Map<string, EntityOption>();
    const teamMap = new Map<string, EntityOption>();

    for (const player of aggregatedPlayers) {
      if (!nationMap.has(player.nation)) {
        nationMap.set(player.nation, {
          value: player.nation,
          label: player.nation,
          imgUrl: player.nationImg
        });
      }
      if (!leagueMap.has(player.league)) {
        leagueMap.set(player.league, {
          value: player.league,
          label: player.league,
          imgUrl: player.leagueImg
        });
      }
      if (!teamMap.has(player.team)) {
        teamMap.set(player.team, {
          value: player.team,
          label: player.team,
          imgUrl: player.teamImg
        });
      }
    }

    const nations = Array.from(nationMap.values()).sort((a, b) => a.label.localeCompare(b.label));
    const leagues = Array.from(leagueMap.values()).sort((a, b) => a.label.localeCompare(b.label));
    const teams = Array.from(teamMap.values()).sort((a, b) => a.label.localeCompare(b.label));

    return { nations, leagues, teams };
  }, [aggregatedPlayers]);

  const filteredPlayers = useMemo(() => {
    return aggregatedPlayers
      .filter(player => {
        if (player.rating < filters.ratingRange[0] || player.rating > filters.ratingRange[1]) {
          return false;
        }

        if (filters.positions.length > 0) {
          const playerPositions = player.position.split(' / ');
          if (!filters.positions.some(pos => playerPositions.includes(pos))) {
            return false;
          }
        }

        if (filters.nations.length > 0 && !filters.nations.includes(player.nation)) {
          return false;
        }

        if (filters.leagues.length > 0 && !filters.leagues.includes(player.league)) {
          return false;
        }

        if (filters.teams.length > 0 && !filters.teams.includes(player.team)) {
          return false;
        }

        if (filters.types.length > 0) {
          if (!player.types.some(type => filters.types.includes(type))) {
            return false;
          }
        }

        if (filters.multipleCopiesOnly && player.copies < 2) {
          return false;
        }

        return true;
      })
      .sort((a, b) => b.rating - a.rating);
  }, [aggregatedPlayers, filters]);

  const topStats = useMemo(() => {
    // Count unique players (not total cards) for each category
    const clubCounts = new Map<string, { count: number; imgUrl?: string }>();
    const nationCounts = new Map<string, { count: number; imgUrl?: string }>();
    const leagueCounts = new Map<string, { count: number; imgUrl?: string }>();
    const positionCounts = new Map<string, number>();

    for (const player of filteredPlayers) {
      // Each unique player counts as 1, regardless of copies
      const clubData = clubCounts.get(player.team) || { count: 0, imgUrl: player.teamImg };
      clubData.count += 1;
      clubCounts.set(player.team, clubData);

      const nationData = nationCounts.get(player.nation) || { count: 0, imgUrl: player.nationImg };
      nationData.count += 1;
      nationCounts.set(player.nation, nationData);

      const leagueData = leagueCounts.get(player.league) || { count: 0, imgUrl: player.leagueImg };
      leagueData.count += 1;
      leagueCounts.set(player.league, leagueData);

      // For positions, count each position the player qualifies for (but still 1 per player per position)
      const positions = player.position.split(' / ');
      for (const pos of positions) {
        const trimmedPos = pos.trim();
        positionCounts.set(trimmedPos, (positionCounts.get(trimmedPos) || 0) + 1);
      }
    }

    const sortByCount = (a: TopItem, b: TopItem) => b.count - a.count;

    const topClubs: TopItem[] = Array.from(clubCounts.entries())
      .map(([name, data]) => ({ name, count: data.count, imgUrl: data.imgUrl }))
      .sort(sortByCount);

    const topNations: TopItem[] = Array.from(nationCounts.entries())
      .map(([name, data]) => ({ name, count: data.count, imgUrl: data.imgUrl }))
      .sort(sortByCount);

    const topLeagues: TopItem[] = Array.from(leagueCounts.entries())
      .map(([name, data]) => ({ name, count: data.count, imgUrl: data.imgUrl }))
      .sort(sortByCount);

    const topPositions: TopItem[] = Array.from(positionCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort(sortByCount);

    return { topClubs, topNations, topLeagues, topPositions };
  }, [filteredPlayers]);

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'Transfer': return 'blue';
      case 'Storage': return 'green';
      case 'Duplicated': return 'red';
      default: return 'gray';
    }
  };

  const getRatingGradientColor = (rating: number): string => {
    // Clear tier-based colors with distinct jumps at 84 and 87
    if (rating <= 70) {
      // Low tier: red gradient
      const t = (rating - 47) / (70 - 47);
      return `color-mix(in srgb, var(--mantine-color-red-8) ${(1 - t) * 100}%, var(--mantine-color-red-6))`;
    } else if (rating <= 76) {
      // Mid-low tier: red to orange
      const t = (rating - 71) / (76 - 71);
      return `color-mix(in srgb, var(--mantine-color-red-6) ${(1 - t) * 100}%, var(--mantine-color-orange-5))`;
    } else if (rating <= 83) {
      // Mid tier: yellow to blue
      const t = (rating - 77) / (83 - 77);
      return `color-mix(in srgb, var(--mantine-color-yellow-5) ${(1 - t) * 100}%, var(--mantine-color-blue-6))`;
    } else if (rating <= 86) {
      // High tier (84-86): purple - DISTINCT JUMP from 83
      const t = (rating - 84) / (86 - 84);
      return `color-mix(in srgb, var(--mantine-color-violet-7) ${(1 - t) * 100}%, var(--mantine-color-grape-5))`;
    } else {
      // Elite tier (87+): green to teal - DISTINCT JUMP from 86
      const t = Math.min(1, (rating - 87) / (99 - 87));
      return `color-mix(in srgb, var(--mantine-color-green-6) ${(1 - t) * 100}%, var(--mantine-color-teal-5))`;
    }
  };

  const uniquePlayersCount = filteredPlayers.length;
  const totalCardsCount = filteredPlayers.reduce((sum, p) => sum + p.copies, 0);
  const avgRating = filteredPlayers.length > 0
    ? Math.round(filteredPlayers.reduce((sum, p) => sum + p.rating * p.copies, 0) / totalCardsCount)
    : 0;
  const duplicatesCount = filteredPlayers.filter(p => p.copies > 1).reduce((sum, p) => sum + (p.copies - 1), 0);

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

  return (
    <AppShell
      header={{ height: 60 }}
      padding="sm"
    >
      <AppShell.Header>
        <Flex h="100%" align="center" justify="space-between" px="md">
          <Group gap="xs">
            <Image src="/vite.svg" w={28} h={28} />
            <Title order={3} style={{ color: '#228be6' }}>
              FC SBC Optimizer
            </Title>
          </Group>

          <Group>
            <TextInput
              placeholder="Enter X-UT-SID..."
              value={sid}
              onChange={(e) => setSid(e.target.value)}
              style={{ width: 320 }}
              size="sm"
              styles={{
                input: {
                  fontFamily: 'monospace',
                  fontSize: '0.75rem'
                }
              }}
            />
            <Tooltip label="Refresh data">
              <ActionIcon
                variant="filled"
                color="blue"
                size="md"
                onClick={fetchData}
                loading={loading}
                disabled={!sid.trim()}
              >
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
            {lastRefresh && (
              <Text size="xs" c="dimmed">
                Last: {lastRefresh.toLocaleTimeString()}
              </Text>
            )}
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
                    <Alert
                      icon={<IconAlertCircle size={14} />}
                      title="Error"
                      color="red"
                      withCloseButton
                      onClose={() => setError(null)}
                      py="xs"
                    >
                      {error}
                    </Alert>
                  )}

                  {warnings.length > 0 && (
                    <Alert
                      icon={<IconAlertTriangle size={14} />}
                      title="Warning"
                      color="yellow"
                      withCloseButton
                      onClose={() => setWarnings([])}
                      py="xs"
                    >
                      <Stack gap={2}>
                        {warnings.map((warning, index) => (
                          <Text key={index} size="xs">{warning}</Text>
                        ))}
                      </Stack>
                    </Alert>
                  )}

                  {/* Filters */}
                  <Paper p="sm" radius="sm" withBorder>
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Title order={6}>Filters</Title>
                        <Button
                          variant="subtle"
                          size="xs"
                          onClick={() => setFilters({
                            ratingRange: [47, 99],
                            positions: [],
                            nations: [],
                            leagues: [],
                            teams: [],
                            types: [],
                            multipleCopiesOnly: false,
                          })}
                        >
                          Clear filters
                        </Button>
                      </Group>

                    <Box mb="md">
                        <Text size="xs" fw={500} mb={4}>Rating: {filters.ratingRange[0]} - {filters.ratingRange[1]}</Text>
                        <RangeSlider
                          min={47}
                          max={99}
                          step={1}
                          size="xs"
                          value={filters.ratingRange}
                          onChange={(value) => setFilters(prev => ({ ...prev, ratingRange: value }))}
                          marks={[
                            { value: 47, label: '47' },
                            { value: 65, label: '65' },
                            { value: 80, label: '80' },
                            { value: 99, label: '99' },
                          ]}
                        />
                      </Box>

                      <SimpleGrid cols={{ base: 2, md: 5 }} spacing="xs">
                        <MultiSelect
                          label="Position"
                          placeholder="All"
                          data={ALL_POSITIONS}
                          value={filters.positions}
                          onChange={(value) => setFilters(prev => ({ ...prev, positions: value }))}
                          searchable
                          clearable
                          size="xs"
                        />

                        <MultiSelect
                          label="Type"
                          placeholder="All"
                          data={PLAYER_TYPES}
                          value={filters.types}
                          onChange={(value) => setFilters(prev => ({ ...prev, types: value as typeof PLAYER_TYPES }))}
                          clearable
                          size="xs"
                        />

                        <MultiSelect
                          label="Nation"
                          placeholder="All"
                          data={filterOptions.nations}
                          value={filters.nations}
                          onChange={(value) => setFilters(prev => ({ ...prev, nations: value }))}
                          searchable
                          clearable
                          size="xs"
                          renderOption={({ option }) => {
                            const opt = option as EntityOption;
                            return <EntityWithImage name={opt.label} imgUrl={opt.imgUrl} />;
                          }}
                        />

                        <MultiSelect
                          label="League"
                          placeholder="All"
                          data={filterOptions.leagues}
                          value={filters.leagues}
                          onChange={(value) => setFilters(prev => ({ ...prev, leagues: value }))}
                          searchable
                          clearable
                          size="xs"
                          renderOption={({ option }) => {
                            const opt = option as EntityOption;
                            return <EntityWithImage name={opt.label} imgUrl={opt.imgUrl} />;
                          }}
                        />

                        <MultiSelect
                          label="Team"
                          placeholder="All"
                          data={filterOptions.teams}
                          value={filters.teams}
                          onChange={(value) => setFilters(prev => ({ ...prev, teams: value }))}
                          searchable
                          clearable
                          size="xs"
                          renderOption={({ option }) => {
                            const opt = option as EntityOption;
                            return <EntityWithImage name={opt.label} imgUrl={opt.imgUrl} />;
                          }}
                        />
                      </SimpleGrid>

                      <Checkbox
                        label="Multiple copies only"
                        checked={filters.multipleCopiesOnly}
                        onChange={(e) => setFilters(prev => ({ ...prev, multipleCopiesOnly: e.target.checked }))}
                        size="xs"
                      />
                    </Stack>
                  </Paper>

                  {/* Player Table */}
                  <Paper p="sm" radius="sm" withBorder pos="relative" style={{ flex: 1 }}>
                    <LoadingOverlay visible={loading} />

                    <Table.ScrollContainer minWidth={600}>
                      <Table striped highlightOnHover horizontalSpacing="xs" verticalSpacing="xs" fz="xs">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Name</Table.Th>
                            <Table.Th>Rtg</Table.Th>
                            <Table.Th>Pos</Table.Th>
                            <Table.Th>Nation</Table.Th>
                            <Table.Th>League</Table.Th>
                            <Table.Th>Team</Table.Th>
                            <Table.Th>#</Table.Th>
                            <Table.Th>Type</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {filteredPlayers.length === 0 ? (
                            <Table.Tr>
                              <Table.Td colSpan={8}>
                                <Text ta="center" c="dimmed" py="md" size="sm">
                                  {players.length === 0 ? 'No players loaded' : 'No players match the current filters'}
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          ) : (
                            filteredPlayers.map((player, index) => (
                              <Table.Tr key={`${player.assetId}-${player.rating}-${index}`}>
                                <Table.Td fw={500}>{player.name}</Table.Td>
                                <Table.Td>
                                  <Badge
                                    size="xs"
                                    variant="filled"
                                    style={{ backgroundColor: getRatingGradientColor(player.rating) }}
                                  >
                                    {player.rating}
                                  </Badge>
                                </Table.Td>
                                <Table.Td>{player.position}</Table.Td>
                                <Table.Td>
                                  <EntityWithImage name={player.nation} imgUrl={player.nationImg} />
                                </Table.Td>
                                <Table.Td>
                                  <EntityWithImage name={player.league} imgUrl={player.leagueImg} />
                                </Table.Td>
                                <Table.Td>
                                  <EntityWithImage name={player.team} imgUrl={player.teamImg} />
                                </Table.Td>
                                <Table.Td>
                                  <Badge
                                    size="xs"
                                    variant={player.copies > 1 ? 'filled' : 'light'}
                                    color={player.copies > 1 ? 'orange' : 'gray'}
                                  >
                                    {player.copies}
                                  </Badge>
                                </Table.Td>
                                <Table.Td>
                                  <Group gap={2}>
                                    {player.types.map(type => (
                                      <Badge
                                        key={type}
                                        size="xs"
                                        variant="light"
                                        color={getTypeBadgeColor(type)}
                                      >
                                        {type.charAt(0)}
                                      </Badge>
                                    ))}
                                  </Group>
                                </Table.Td>
                              </Table.Tr>
                            ))
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
                  {/* Quick Stats - 2 columns */}
                  <SimpleGrid cols={2} spacing="xs">
                    <AnimatedCounter
                      value={uniquePlayersCount}
                      label="Players"
                      icon={<IconUsers size={16} />}
                      color="blue"
                    />
                    <AnimatedCounter
                      value={totalCardsCount}
                      label="Cards"
                      icon={<IconCards size={16} />}
                      color="green"
                    />
                    <AnimatedCounter
                      value={avgRating}
                      label="Avg Rtg"
                      icon={<IconTrophy size={16} />}
                      color="yellow"
                    />
                    <AnimatedCounter
                      value={duplicatesCount}
                      label="Dupes"
                      icon={<IconShirt size={16} />}
                      color="orange"
                    />
                  </SimpleGrid>

                  {/* Charts - 2 columns */}
                  <SimpleGrid cols={2} spacing="xs">
                    <RatingDistributionChart players={filteredPlayers} />
                    <TypeDistributionChart players={filteredPlayers} />
                  </SimpleGrid>

                  {/* Top Lists - 2 columns */}
                  <SimpleGrid cols={2} spacing="xs">
                    <PaginatedTopList
                      title="🏆 Top Clubs"
                      items={topStats.topClubs}
                      color="blue"
                      maxCount={topStats.topClubs[0]?.count || 1}
                    />
                    <PaginatedTopList
                      title="🌍 Top Nations"
                      items={topStats.topNations}
                      color="green"
                      maxCount={topStats.topNations[0]?.count || 1}
                    />
                    <PaginatedTopList
                      title="⚽ Top Leagues"
                      items={topStats.topLeagues}
                      color="violet"
                      maxCount={topStats.topLeagues[0]?.count || 1}
                    />
                    <PaginatedTopList
                      title="📍 Top Positions"
                      items={topStats.topPositions}
                      color="orange"
                      maxCount={topStats.topPositions[0]?.count || 1}
                    />
                  </SimpleGrid>

                  {/* Live SBCs */}
                  <SBCList sid={sid} />
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
