import { useState, useEffect, useRef } from 'react';
import { Paper, Group, ThemeIcon, Box, Text } from '@mantine/core';

export function AnimatedCounter({ value, label, icon, color }: { value: number; label: string; icon: React.ReactNode; color: string }) {
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
