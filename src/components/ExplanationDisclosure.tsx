import { memo, useState } from 'react';

interface Props {
  title?: string;
  whyNow: string;
  outcome?: string;
  className?: string;
  toggleClassName?: string;
  bodyClassName?: string;
  titleClassName?: string;
  textClassName?: string;
  labelClassName?: string;
}

export const ExplanationDisclosure = memo(function ExplanationDisclosure({
  title,
  whyNow,
  outcome,
  className,
  toggleClassName,
  bodyClassName,
  titleClassName,
  textClassName,
  labelClassName,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      <button
        type="button"
        className={toggleClassName}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? '理由を閉じる' : '理由を見る'}
      </button>
      {open && (
        <div className={bodyClassName}>
          {title && <p className={titleClassName}>{title}</p>}
          <p className={textClassName}>
            <span className={labelClassName}>なぜ今:</span> {whyNow}
          </p>
          {outcome && <p className={textClassName}>{outcome}</p>}
        </div>
      )}
    </div>
  );
});
