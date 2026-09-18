'use client';

import { useEffect, useState } from 'react';

interface LocalTimeProps {
  isoDate: string;
  format?: 'datetime' | 'date' | 'time';
  prefix?: string;
}

export function LocalTime({ isoDate, format = 'datetime', prefix = '' }: LocalTimeProps) {
  const [formatted, setFormatted] = useState<string>('');

  useEffect(() => {
    try {
      const date = new Date(isoDate);
      if (isNaN(date.getTime())) {
        setFormatted(isoDate);
        return;
      }

      if (format === 'time') {
        setFormatted(date.toLocaleTimeString());
      } else if (format === 'date') {
        setFormatted(date.toLocaleDateString());
      } else {
        setFormatted(date.toLocaleString());
      }
    } catch {
      setFormatted(isoDate);
    }
  }, [isoDate, format]);

  if (!formatted) {
    return null;
  }

  return (
    <span>
      {prefix}
      {formatted}
    </span>
  );
}
