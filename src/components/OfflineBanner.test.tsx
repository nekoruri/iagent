import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OfflineBanner } from './OfflineBanner';

describe('OfflineBanner', () => {
  it('isOnline=true の場合、何も表示しない', () => {
    const { container } = render(<OfflineBanner isOnline={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('isOnline=false の場合、バナーを表示する', () => {
    render(<OfflineBanner isOnline={false} />);
    expect(screen.getByText('オフラインです — ネットワーク接続を確認してください')).toBeInTheDocument();
  });

  it('role="alert" が設定されている', () => {
    render(<OfflineBanner isOnline={false} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('WiFi オフアイコンが含まれている', () => {
    const { container } = render(<OfflineBanner isOnline={false} />);
    const svg = container.querySelector('svg.offline-banner-icon');
    expect(svg).toBeInTheDocument();
  });
});
