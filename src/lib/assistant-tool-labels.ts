const LABELS: Record<string, string> = {
  list_docs: "Reading docs",
  show_place: "Finding that page",
  search_docs: "Searching docs",
  read_doc: "Reading a doc",
  list_people: "Looking up people",
  list_packages: "Looking up packages",
  list_groups: "Looking up groups",
  list_my_groups: "Looking up your groups",
  get_group: "Reading a group",
  get_grades: "Reading grades",
  list_cycle_dates: "Looking up cycle dates",
  list_producers: "Looking up producers",
  list_queue: "Looking up the queue",
  list_access_requests: "Looking up access requests",
  propose_add_person: "Preparing to add a person",
  propose_set_nickname: "Preparing a nickname change",
  propose_add_package: "Preparing a new package",
  propose_update_package: "Preparing a package change",
  propose_set_cycle_dates: "Preparing cycle date changes",
  propose_remove_package: "Preparing to remove a package",
  propose_assign_role: "Preparing a role change",
  propose_remove_role: "Preparing to remove a role",
  propose_queue_package: "Preparing a queue change",
  propose_set_cycles_per_semester: "Preparing a cycle-count change",
  propose_decide_access: "Preparing an access decision",
  propose_set_grade: "Preparing a grade change",
  propose_set_portfolio: "Preparing a portfolio change",
  propose_publish_grade: "Preparing to publish a grade",
  propose_remove_person: "Preparing to remove a person"
};

export function assistantToolLabel(name: string): string {
  const mapped = LABELS[name];
  if (mapped) {
    return mapped;
  }
  if (name.startsWith("propose_")) {
    return "Preparing a change";
  }
  return "Looking that up";
}
