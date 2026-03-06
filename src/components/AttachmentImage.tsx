import { useState } from 'react';

interface Props {
  previewSrc: string;
  fallbackSrc?: string;
  alt: string;
  imgClassName: string;
  fallbackClassName?: string;
  fallbackLabel?: string;
  onClick?: () => void;
}

export function AttachmentImage({
  previewSrc,
  fallbackSrc,
  alt,
  imgClassName,
  fallbackClassName = 'attachment-image-fallback',
  fallbackLabel,
  onClick,
}: Props) {
  const [errorStage, setErrorStage] = useState<0 | 1 | 2>(0);

  if (errorStage === 2) {
    return (
      <div className={fallbackClassName} role="img" aria-label={`${fallbackLabel ?? alt} のプレビューなし`}>
        <span className="attachment-image-fallback-icon" aria-hidden="true">&#128444;</span>
        <span className="attachment-image-fallback-text">プレビューなし</span>
      </div>
    );
  }

  const currentSrc = errorStage === 1 && fallbackSrc ? fallbackSrc : previewSrc;

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={imgClassName}
      onClick={onClick}
      onError={() => {
        if (errorStage === 0 && fallbackSrc && fallbackSrc !== previewSrc) {
          setErrorStage(1);
          return;
        }
        setErrorStage(2);
      }}
    />
  );
}
