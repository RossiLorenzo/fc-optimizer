import { useMemo } from 'react';
import { Paper, Text, Flex, Stack, Group, Box, Progress, RingProgress } from '@mantine/core';
import type { AggregatedPlayer } from '../types/player';

export function RatingDistributionChart({ players }: { players: AggregatedPlayer[] }) {
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

export function TypeDistributionChart({ players }: { players: AggregatedPlayer[] }) {
  const distribution = useMemo(() => {
    const counts = { Transfer: 0, Storage: 0, Duplicated: 0 };
    players.forEach(p => {
      p.types.forEach(type => { counts[type] += p.copies; });
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
