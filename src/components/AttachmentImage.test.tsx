import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AttachmentImage } from './AttachmentImage';

describe('AttachmentImage', () => {
  it('サムネイル読み込み失敗時は fallbackSrc に切り替える', () => {
    render(
      <AttachmentImage
        previewSrc="thumb.png"
        fallbackSrc="full.png"
        alt="テスト画像"
        imgClassName="test-image"
      />,
    );

    const image = screen.getByAltText('テスト画像');
    expect(image).toHaveAttribute('src', 'thumb.png');

    fireEvent.error(image);
    expect(screen.getByAltText('テスト画像')).toHaveAttribute('src', 'full.png');
  });

  it('fallbackSrc も失敗した場合はプレースホルダを表示する', () => {
    render(
      <AttachmentImage
        previewSrc="thumb.png"
        fallbackSrc="full.png"
        alt="壊れた画像"
        imgClassName="test-image"
        fallbackClassName="test-fallback"
      />,
    );

    const image = screen.getByAltText('壊れた画像');
    fireEvent.error(image);
    fireEvent.error(screen.getByAltText('壊れた画像'));

    expect(screen.getByRole('img', { name: '壊れた画像 のプレビューなし' })).toBeInTheDocument();
    expect(screen.getByText('プレビューなし')).toBeInTheDocument();
  });
});
