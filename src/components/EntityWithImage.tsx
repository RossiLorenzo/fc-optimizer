import { Group, Text, Image } from '@mantine/core';

const IMG_SIZE = 18;

export function EntityWithImage({ name, imgUrl, size = IMG_SIZE }: { name: string; imgUrl?: string; size?: number }) {
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
