import { ProjectsScreen } from '@/components/projects/projects-screen';

/**
 * `/projects` — workspace project management. Replaces the sidebar slot the
 * retired `/setup` route held, and the "add another project" entry point that
 * `/setup/new` owned.
 */
export default function ProjectsPage() {
  return <ProjectsScreen />;
}
