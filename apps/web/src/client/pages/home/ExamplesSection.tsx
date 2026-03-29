import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowUpLeft } from '@phosphor-icons/react';
import { springs } from '@/lib/animations';
import { IntegrationIcon } from '@/components/landing/IntegrationIcons';

interface UseCaseExample {
  key: string;
  title: string;
  description: string;
  prompt: string;
  icons: readonly string[];
}

interface ExamplesSectionProps {
  useCaseExamples: UseCaseExample[];
  onExampleClick: (prompt: string) => void;
}

export function ExamplesSection({ useCaseExamples, onExampleClick }: ExamplesSectionProps) {
  const { t } = useTranslation('home');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...springs.gentle, delay: 0.2 }}
      className="w-full"
    >
      <div className="flex flex-col gap-3 pt-12 pb-[120px]">
        <h2 className="font-apparat text-[22px] font-light tracking-[-0.66px] text-foreground text-center">
          {t('examplePrompts')}
        </h2>

        <div className="grid grid-cols-3 gap-4 w-full">
          {useCaseExamples.map((example, index) => (
            <motion.button
              key={example.key}
              data-testid={`home-example-${index}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onExampleClick(example.prompt)}
              className="group flex flex-col justify-between rounded-[4px] border border-border hover:border-muted-foreground/40 active:border-muted-foreground/40 bg-accent pl-3 pr-4 py-3 text-left h-[164px] transition-colors"
            >
              <div className="flex items-start justify-between w-full">
                <span className="font-sans text-[14px] leading-[18px] tracking-[-0.28px] text-foreground whitespace-pre-line w-[120px]">
                  {example.title}
                </span>
                <span className="shrink-0 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0 group-active:translate-y-0 -scale-y-100 rotate-180">
                  <ArrowUpLeft className="w-4 h-4 text-foreground" weight="regular" />
                </span>
              </div>

              <p className="text-[13px] leading-[15px] tracking-[-0.13px] text-muted-foreground">
                {example.description}
              </p>

              <div className="flex items-center gap-[2px]">
                {example.icons.map((domain) => (
                  <div
                    key={domain}
                    className="flex items-center rounded-[5.778px] bg-popover p-[3.25px] shrink-0"
                  >
                    <IntegrationIcon domain={domain} className="w-[22px] h-[22px]" />
                  </div>
                ))}
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
