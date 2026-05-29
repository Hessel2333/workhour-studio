import { useMemo, useState } from 'react';
import type { AppState, Employee, Project, ProjectPhase } from '../types';

interface ProjectsViewProps {
  state: AppState;
  currentUser: Employee;
  onCreateProject: (draft: {
    name: string;
    code: string;
    category: Project['category'];
    color: string;
    phase?: ProjectPhase;
  }) => string | undefined;
  onUpdateProject: (projectId: string, patch: Partial<Project>) => void;
}

const PROJECT_COLOR_PALETTE = ['#c96442', '#7c8f62', '#6a7ca8', '#0f9d8a', '#9a5fd4', '#c98132'];
const PROJECT_CATEGORY_LABEL: Record<Project['category'], string> = {
  enterprise: '大型项目',
  agile: '敏捷迭代',
  incubation: '孵化项目'
};
const PROJECT_PHASE_LABEL: Record<ProjectPhase, string> = {
  discussion: '讨论阶段',
  brainstorm: '头脑风暴',
  development: '开发',
  implementation: '实施',
  debugging: '调试'
};
const PROJECT_PHASES: ProjectPhase[] = ['discussion', 'brainstorm', 'development', 'implementation', 'debugging'];

const emptyDraft = {
  name: '',
  code: '',
  category: 'enterprise' as Project['category'],
  color: PROJECT_COLOR_PALETTE[0],
  phase: 'discussion' as ProjectPhase
};

export function ProjectsView({ state, currentUser, onCreateProject, onUpdateProject }: ProjectsViewProps) {
  const [draft, setDraft] = useState(emptyDraft);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const canManageProjects = currentUser.role === 'manager' || currentUser.role === 'admin' || currentUser.role === 'pm';
  const projectMetrics = useMemo(
    () =>
      state.projects.map((project) => {
        const relatedTasks = state.tasks.filter((task) => task.projectId === project.id);
        const completedTasks = relatedTasks.filter((task) => task.status === 'done').length;
        const progress = relatedTasks.length ? Math.round((completedTasks / relatedTasks.length) * 100) : 0;

        return {
          project,
          progress,
          totalTasks: relatedTasks.length,
          completedTasks
        };
      }),
    [state.projects, state.tasks]
  );

  return (
    <section className="page-shell">
      <div className="manager-page-header panel-card">
        <div>
          <h2>项目列表</h2>
          <p className="muted-copy">项目是低频对象，集中在这里维护阶段、健康度和整体进度。</p>
        </div>
        <div className="manager-page-meta">
          <span className="inline-chip">{state.projects.length} 个项目</span>
          {canManageProjects ? (
            <button className="primary-button" onClick={() => setIsCreateOpen(true)}>
              新建项目
            </button>
          ) : null}
        </div>
      </div>

      <div className="projects-layout single-column">
        <div className="projects-board">
          {projectMetrics.map(({ project, progress, totalTasks, completedTasks }) => (
            <article key={project.id} className="panel-card project-card">
              <div className="project-card-head">
                <div>
                  <div className="project-card-title">
                    <span className="inline-chip" style={{ background: `${project.color}1c`, color: project.color }}>
                      {project.code}
                    </span>
                    <strong>{project.name}</strong>
                  </div>
                  <p className="muted-copy">
                    {PROJECT_CATEGORY_LABEL[project.category]}
                    {' · '}
                    {project.billable ? '计费项目' : '内部项目'}
                  </p>
                </div>
                <span className={`risk-badge risk-${project.health === 'risk' ? 'high' : project.health === 'attention' ? 'medium' : 'low'}`}>
                  {project.health === 'healthy' ? '健康' : project.health === 'attention' ? '关注' : '风险'}
                </span>
              </div>

              <div className="project-phase-strip">
                {PROJECT_PHASES.map((phase) => (
                  <button
                    key={phase}
                    type="button"
                    className={`project-phase-step ${project.phase === phase ? 'active' : ''}`}
                    disabled={!canManageProjects}
                    onClick={() => onUpdateProject(project.id, { phase })}
                  >
                    {PROJECT_PHASE_LABEL[phase]}
                  </button>
                ))}
              </div>

              <div className="project-card-metrics">
                <div>
                  <span>当前阶段</span>
                  <strong>{PROJECT_PHASE_LABEL[project.phase]}</strong>
                </div>
                <div>
                  <span>任务进度</span>
                  <strong>{completedTasks}/{totalTasks}</strong>
                </div>
                <div>
                  <span>完成率</span>
                  <strong>{progress}%</strong>
                </div>
              </div>

              <div className="load-bar">
                <div className="load-bar-fill" style={{ width: `${progress}%`, background: project.color }} />
              </div>
            </article>
          ))}
        </div>
      </div>

      {canManageProjects && isCreateOpen ? (
        <div className="modal-backdrop" onClick={() => setIsCreateOpen(false)}>
          <div className="modal-card project-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="card-header">
              <div>
                <h3>新项目</h3>
                <p className="muted-copy">只在需要时创建，避免长期占用页面空间。</p>
              </div>
              <button className="icon-button modal-close-button" onClick={() => setIsCreateOpen(false)} aria-label="关闭">
                ×
              </button>
            </div>
            <div className="manager-form-grid">
              <label className="full-span">
                项目名称
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="例如：零售渠道统一工作台"
                />
              </label>
              <label>
                项目代号
                <input
                  value={draft.code}
                  onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                  placeholder="例如：RTL-6"
                />
              </label>
              <label>
                项目类型
                <select
                  value={draft.category}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, category: event.target.value as Project['category'] }))
                  }
                >
                  {Object.entries(PROJECT_CATEGORY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                当前阶段
                <select
                  value={draft.phase}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, phase: event.target.value as ProjectPhase }))
                  }
                >
                  {PROJECT_PHASES.map((phase) => (
                    <option key={phase} value={phase}>
                      {PROJECT_PHASE_LABEL[phase]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="manager-picker-row">
              <span>项目色</span>
              <div className="manager-color-palette">
                {PROJECT_COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`manager-color-swatch ${draft.color === color ? 'active' : ''}`}
                    style={{ ['--swatch-color' as string]: color }}
                    onClick={() => setDraft((current) => ({ ...current, color }))}
                  />
                ))}
              </div>
            </div>
            <div className="manager-form-footer">
              <button className="secondary-button" onClick={() => setIsCreateOpen(false)}>
                取消
              </button>
              <button
                className="primary-button"
                disabled={!draft.name.trim() || !draft.code.trim()}
                onClick={() => {
                  const created = onCreateProject(draft);
                  if (created) {
                    setDraft(emptyDraft);
                    setIsCreateOpen(false);
                  }
                }}
              >
                创建项目
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
