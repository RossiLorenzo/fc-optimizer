import { useState, useEffect, useRef } from 'react';
import {
  Paper, Group, Text, ActionIcon, Table, Badge, Button, Center, Alert,
} from '@mantine/core';
import {
  IconChevronLeft, IconChevronRight, IconThumbUp, IconThumbDown,
  IconAlertCircle, IconLoader, IconTarget,
} from '@tabler/icons-react';
import { fetchAllSBCsWithDetails, fetchSBCSetChallengeDetails } from '../services/api';
import type { SBCWithDetails, SBCChallengeDetail } from '../services/api';

export interface SelectedChallenge {
  challengeId: number;
  challengeName: string;
  setName: string;
  formation: string;
}

export function SBCList({ sid, onChallengeSelect, selectedChallenge }: {
  sid: string;
  onChallengeSelect: (challenge: SelectedChallenge | null) => void;
  selectedChallenge: SelectedChallenge | null;
}) {
  const [sbcs, setSbcs] = useState<SBCWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const fetchingRef = useRef(false);

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
    if (fetchingRef.current) return;

    let cancelled = false;
    const loadSBCs = async () => {
      fetchingRef.current = true;
      try {
        setLoading(true);
        setError(null);
        const data = await fetchAllSBCsWithDetails(sid);
        if (!cancelled) setSbcs(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load SBCs');
      } finally {
        if (!cancelled) setLoading(false);
        fetchingRef.current = false;
      }
    };

    loadSBCs();
    return () => { cancelled = true; fetchingRef.current = false; };
  }, [sid]);

  const handleSBCClick = async (setId: number, name: string) => {
    setSelectedSet({ setId, name });
    setChallengesLoading(true);
    setChallengesError(null);
    try {
      setChallenges(await fetchSBCSetChallengeDetails(sid, setId));
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

  // Empty / loading / error states
  if (!sid.trim()) {
    return (
      <Paper p="xs" radius="sm" withBorder>
        <Text size="xs" fw={600} mb="xs">🎯 Live SBCs</Text>
        <Text size="xs" c="dimmed" ta="center" py="md">Enter SID to load SBCs</Text>
      </Paper>
    );
  }

  if (loading) {
    return (
      <Paper p="xs" radius="sm" withBorder>
        <Text size="xs" fw={600} mb="xs">🎯 Live SBCs</Text>
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
        <Text size="xs" fw={600} mb="xs">🎯 Live SBCs</Text>
        <Alert color="red" variant="light" title="Error" icon={<IconAlertCircle size={14} />}>
          <Text size="xs">{error}</Text>
        </Alert>
      </Paper>
    );
  }

  // Challenge drill-down view
  if (selectedSet) {
    return (
      <Paper p="xs" radius="sm" withBorder>
        <Group justify="space-between" mb="xs">
          <Group gap="xs">
            <ActionIcon size="xs" variant="subtle" onClick={handleBackClick}>
              <IconChevronLeft size={14} />
            </ActionIcon>
            <Text size="xs" fw={600} truncate style={{ maxWidth: 180 }}>{selectedSet.name}</Text>
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
                  <Table.Th style={{ fontSize: '10px', width: '40%' }}>Challenge</Table.Th>
                  <Table.Th style={{ fontSize: '10px', textAlign: 'center', width: '18%' }}>Fmt</Table.Th>
                  <Table.Th style={{ fontSize: '10px', textAlign: 'center', width: '18%' }}>Rtg</Table.Th>
                  <Table.Th style={{ fontSize: '10px', textAlign: 'center', width: '24%' }}>Push</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {challenges.map(challenge => {
                  const isSelected = selectedChallenge?.challengeId === challenge.challengeId;
                  return (
                    <Table.Tr key={challenge.challengeId} bg={isSelected ? 'blue.0' : undefined}>
                      <Table.Td><Text size="xs" truncate>{challenge.name}</Text></Table.Td>
                      <Table.Td style={{ textAlign: 'center' }}>
                        <Text size="xs">{challenge.formation.replace('f', '')}</Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'center' }}>
                        <Text size="xs" c={challenge.teamRating ? 'blue' : 'dimmed'}>
                          {challenge.teamRating ?? '-'}
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'center' }}>
                        <Button
                          size="compact-xs"
                          variant={isSelected ? 'filled' : 'light'}
                          color={isSelected ? 'blue' : 'gray'}
                          onClick={() => onChallengeSelect(isSelected ? null : {
                            challengeId: challenge.challengeId,
                            challengeName: challenge.name,
                            setName: selectedSet.name,
                            formation: challenge.formation,
                          })}
                          leftSection={<IconTarget size={10} />}
                        >
                          {isSelected ? 'Selected' : 'Select'}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
    );
  }

  // Main SBC list view
  return (
    <Paper p="xs" radius="sm" withBorder>
      <Group justify="space-between" mb="xs">
        <Text size="xs" fw={600}>🎯 Live SBCs ({sbcs.length})</Text>
        {totalPages > 1 && (
          <Group gap={2}>
            <ActionIcon size="xs" variant="subtle" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <IconChevronLeft size={12} />
            </ActionIcon>
            <Text size="xs" c="dimmed">{page + 1}/{totalPages}</Text>
            <ActionIcon size="xs" variant="subtle" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
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
                <Group gap={2} justify="center"><IconThumbUp size={10} color="green" /></Group>
              </Table.Th>
              <Table.Th style={{ fontSize: '10px', textAlign: 'center', width: '14%' }}>
                <Group gap={2} justify="center"><IconThumbDown size={10} color="red" /></Group>
              </Table.Th>
              <Table.Th style={{ fontSize: '10px', textAlign: 'center', width: '14%' }}>%</Table.Th>
              <Table.Th style={{ fontSize: '10px', textAlign: 'center', width: '13%' }}>#</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {currentSBCs.map(sbc => (
              <Table.Tr key={sbc.setId} style={{ cursor: 'pointer' }} onClick={() => handleSBCClick(sbc.setId, sbc.name)}>
                <Table.Td><Text size="xs" truncate>{sbc.name}</Text></Table.Td>
                <Table.Td style={{ textAlign: 'center' }}><Text size="xs" c="green">{sbc.likes}</Text></Table.Td>
                <Table.Td style={{ textAlign: 'center' }}><Text size="xs" c="red">{sbc.dislikes}</Text></Table.Td>
                <Table.Td style={{ textAlign: 'center' }}>
                  <Text size="xs" c={sbc.likePercent >= 70 ? 'green' : sbc.likePercent >= 50 ? 'yellow' : 'red'}>
                    {sbc.likePercent.toFixed(0)}%
                  </Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'center' }}><Text size="xs" c="blue">{sbc.challengesCount}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );
}
