import {
  Braces,
  Columns3,
  Download,
  Gauge,
  Grid2X2,
  Keyboard,
  Languages,
  Layers3,
  Merge,
  MousePointer2,
  PanelsTopLeft,
  Sparkles,
  SwatchBook,
  TreePine,
  type LucideIcon,
} from 'lucide-react'
import {
  translate as translateMessage,
  type Locale,
  type MessageKey,
  type Translate,
} from '../i18n'

export interface CapabilityOverviewProps {
  /** Supplying t takes precedence over locale. */
  locale?: Locale
  t?: Translate
  className?: string
}

type CapabilityScenario = 'analysis' | 'tree' | 'conditional' | 'merged'

interface CapabilityItem {
  icon: LucideIcon
  title: MessageKey
  detail: MessageKey
}

interface CapabilityGroup {
  scenario: CapabilityScenario
  icon: LucideIcon
  label: MessageKey
  detail: MessageKey
  proof: readonly string[]
  items: readonly CapabilityItem[]
}

const OVERVIEW_STATS = [
  { value: '10¹⁰', label: 'capability.stat.scale' },
  { value: '10K+', label: 'capability.stat.span' },
  { value: '05', label: 'capability.stat.rules' },
] as const satisfies readonly { value: string; label: MessageKey }[]

const CAPABILITY_GROUPS: readonly CapabilityGroup[] = [
  {
    scenario: 'analysis',
    icon: Gauge,
    label: 'scenario.analysis',
    detail: 'scenario.analysis.detail',
    proof: ['viewport', 'Map', 'bounded cache'],
    items: [
      {
        icon: PanelsTopLeft,
        title: 'capability.analysis.virtual.title',
        detail: 'capability.analysis.virtual.detail',
      },
      {
        icon: Grid2X2,
        title: 'capability.analysis.fixed.title',
        detail: 'capability.analysis.fixed.detail',
      },
      {
        icon: Columns3,
        title: 'capability.analysis.geometry.title',
        detail: 'capability.analysis.geometry.detail',
      },
    ],
  },
  {
    scenario: 'tree',
    icon: TreePine,
    label: 'scenario.tree',
    detail: 'scenario.tree.detail',
    proof: ['tree / flat', 'lazy nodes', 'TSV'],
    items: [
      {
        icon: TreePine,
        title: 'capability.tree.model.title',
        detail: 'capability.tree.model.detail',
      },
      {
        icon: Braces,
        title: 'capability.tree.renderer.title',
        detail: 'capability.tree.renderer.detail',
      },
      {
        icon: Keyboard,
        title: 'capability.tree.selection.title',
        detail: 'capability.tree.selection.detail',
      },
    ],
  },
  {
    scenario: 'conditional',
    icon: SwatchBook,
    label: 'scenario.conditional',
    detail: 'scenario.conditional.detail',
    proof: ['text', 'fill', 'icon · scale · bar'],
    items: [
      {
        icon: MousePointer2,
        title: 'capability.conditional.style.title',
        detail: 'capability.conditional.style.detail',
      },
      {
        icon: SwatchBook,
        title: 'capability.conditional.visual.title',
        detail: 'capability.conditional.visual.detail',
      },
      {
        icon: Layers3,
        title: 'capability.conditional.compose.title',
        detail: 'capability.conditional.compose.detail',
      },
    ],
  },
  {
    scenario: 'merged',
    icon: Merge,
    label: 'scenario.merged',
    detail: 'scenario.merged.detail',
    proof: ['10K+ span', '.xlsx', '.png'],
    items: [
      {
        icon: Merge,
        title: 'capability.merged.merge.title',
        detail: 'capability.merged.merge.detail',
      },
      {
        icon: Download,
        title: 'capability.merged.export.title',
        detail: 'capability.merged.export.detail',
      },
      {
        icon: Languages,
        title: 'capability.merged.i18n.title',
        detail: 'capability.merged.i18n.detail',
      },
    ],
  },
]

export function CapabilityOverview({
  locale = 'zh-CN',
  t,
  className,
}: CapabilityOverviewProps) {
  const translate = t ?? ((key: MessageKey, params) => translateMessage(locale, key, params))
  const rootClassName = ['capability-overview', className].filter(Boolean).join(' ')

  return (
    <section className={rootClassName} aria-labelledby="capability-overview-title">
      <div className="capability-overview__inner">
        <header className="capability-overview__hero">
          <div className="capability-overview__lead">
            <span className="capability-overview__eyebrow">
              <Sparkles size={14} aria-hidden="true" />
              {translate('capability.eyebrow')}
            </span>
            <h1 id="capability-overview-title">{translate('capability.title')}</h1>
            <p>{translate('capability.intro')}</p>
            <div className="capability-overview__architecture" aria-label="UltiGrid public packages">
              <span>@ultigrid/core</span>
              <i aria-hidden="true" />
              <span>@ultigrid/insight</span>
            </div>
          </div>

          <dl className="capability-overview__stats">
            {OVERVIEW_STATS.map((stat) => (
              <div key={stat.label}>
                <dt>{translate(stat.label)}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="capability-overview__scenarios">
          {CAPABILITY_GROUPS.map((group, groupIndex) => {
            const GroupIcon = group.icon
            return (
              <article
                className="capability-overview__scenario"
                data-scenario={group.scenario}
                id={`capability-${group.scenario}`}
                key={group.scenario}
              >
                <header className="capability-overview__scenario-head">
                  <span className="capability-overview__scenario-index">
                    {String(groupIndex + 1).padStart(2, '0')}
                  </span>
                  <span className="capability-overview__scenario-icon" aria-hidden="true">
                    <GroupIcon size={18} strokeWidth={1.8} />
                  </span>
                  <div>
                    <small>{group.scenario}</small>
                    <h2>{translate(group.label)}</h2>
                    <p>{translate(group.detail)}</p>
                  </div>
                </header>

                <ul className="capability-overview__list">
                  {group.items.map((item) => {
                    const ItemIcon = item.icon
                    return (
                      <li key={item.title}>
                        <span aria-hidden="true">
                          <ItemIcon size={17} strokeWidth={1.8} />
                        </span>
                        <div>
                          <h3>{translate(item.title)}</h3>
                          <p>{translate(item.detail)}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>

                <footer className="capability-overview__proof">
                  {group.proof.map((item) => <span key={item}>{item}</span>)}
                </footer>
              </article>
            )
          })}
        </div>

      </div>
    </section>
  )
}

export default CapabilityOverview
