import { useState, useEffect } from 'react';
import { Paper, Group, Text, ActionIcon, Stack, Box, Badge, Progress, Image } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

const STATS_IMG_SIZE = 20;

export interface TopItem {
  name: string;
  count: number;
  imgUrl?: string;
}

export function PaginatedTopList({
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
