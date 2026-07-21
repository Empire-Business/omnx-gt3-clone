interface TaskLabel {
  text: string;
  color: string;
}

interface ProjectLike {
  id: string;
  name: string;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function getOrderedProjects(projects: ProjectLike[]) {
  return [...projects].sort((left, right) => {
    const leftName = normalizeName(left.name);
    const rightName = normalizeName(right.name);

    if (leftName === rightName) {
      return left.id.localeCompare(right.id);
    }

    return leftName.localeCompare(rightName);
  });
}

function getGeneratedProjectColor(index: number) {
  const hue = Math.round((index * 137.508) % 360);
  const saturation = 68 + (index % 3) * 4;
  const lightness = 46 + (index % 2) * 6;

  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function getProjectLabelColor(project: ProjectLike, projects: ProjectLike[]) {
  if (normalizeName(project.name) === "gt3") {
    return "#2563eb";
  }

  const orderedProjects = getOrderedProjects(projects).filter(
    (currentProject) => normalizeName(currentProject.name) !== "gt3"
  );
  const projectIndex = orderedProjects.findIndex((currentProject) => currentProject.id === project.id);

  if (projectIndex === -1) {
    return getGeneratedProjectColor(orderedProjects.length);
  }

  return getGeneratedProjectColor(projectIndex);
}

export function buildProjectLabel(project: ProjectLike, projects: ProjectLike[]): TaskLabel {
  return {
    text: project.name,
    color: getProjectLabelColor(project, projects),
  };
}

export function getTaskLabelsWithProject(
  labels: TaskLabel[],
  taskProjectId: string | null | undefined,
  taskProjectName: string | null | undefined,
  projects: ProjectLike[]
) {
  const selectedProject =
    (taskProjectId ? projects.find((project) => project.id === taskProjectId) : null) ||
    (taskProjectId && taskProjectName ? { id: taskProjectId, name: taskProjectName } : null);

  return syncProjectLabel(labels, selectedProject, projects);
}

export function getTaskLabelStyle(color: string) {
  return {
    backgroundColor: `color-mix(in srgb, ${color} 22%, white)`,
    color: `color-mix(in srgb, ${color} 78%, black)`,
    borderColor: `color-mix(in srgb, ${color} 30%, white)`,
  };
}

export function syncProjectLabel(
  labels: TaskLabel[],
  selectedProject: ProjectLike | null,
  projects: ProjectLike[]
) {
  const projectNames = new Set(projects.map((project) => normalizeName(project.name)));
  const nonProjectLabels = labels.filter((label) => !projectNames.has(normalizeName(label.text)));

  if (!selectedProject) {
    return nonProjectLabels;
  }

  return [...nonProjectLabels, buildProjectLabel(selectedProject, projects)];
}
