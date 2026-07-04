## Table `profiles`

### Columns

| Name                | Type          | Constraints |
| ------------------- | ------------- | ----------- |
| `id`                | `uuid`        | Primary     |
| `full_name`         | `text`        | Nullable    |
| `email`             | `text`        | Nullable    |
| `avatar_url`        | `text`        | Nullable    |
| `role`              | `text`        | Nullable    |
| `university`        | `text`        | Nullable    |
| `faculty`           | `text`        | Nullable    |
| `governorate`       | `text`        | Nullable    |
| `academic_year`     | `text`        | Nullable    |
| `total_xp`          | `int4`        | Nullable    |
| `current_rank`      | `text`        | Nullable    |
| `team_id`           | `uuid`        | Nullable    |
| `created_at`        | `timestamptz` | Nullable    |
| `department`        | `text`        | Nullable    |
| `track`             | `text`        | Nullable    |
| `admin_permissions` | `jsonb`       | Nullable    |

## Table `teams`

### Columns

| Name             | Type          | Constraints |
| ---------------- | ------------- | ----------- |
| `id`             | `uuid`        | Primary     |
| `name`           | `text`        |             |
| `logo_url`       | `text`        | Nullable    |
| `university`     | `text`        | Nullable    |
| `leader_id`      | `uuid`        | Nullable    |
| `total_score`    | `int4`        | Nullable    |
| `created_at`     | `timestamptz` | Nullable    |
| `governorate`    | `text`        | Nullable    |
| `courses_plan`   | `jsonb`       | Nullable    |
| `weekly_tasks`   | `jsonb`       | Nullable    |
| `requests`       | `jsonb`       | Nullable    |
| `specialization` | `uuid`        | Nullable    |

## Table `team_requests`

### Columns

| Name               | Type          | Constraints |
| ------------------ | ------------- | ----------- |
| `id`               | `uuid`        | Primary     |
| `requester_id`     | `uuid`        |             |
| `team_name`        | `text`        |             |
| `logo_url`         | `text`        | Nullable    |
| `reason`           | `text`        | Nullable    |
| `status`           | `text`        | Nullable    |
| `submitted_at`     | `timestamptz` | Nullable    |
| `university`       | `text`        | Nullable    |
| `governorate`      | `text`        | Nullable    |
| `expected_size`    | `int4`        | Nullable    |
| `specialization`   | `text`        | Nullable    |
| `leader_gpa`       | `text`        | Nullable    |
| `rejection_reason` | `text`        | Nullable    |
| `reviewed_by`      | `uuid`        | Nullable    |
| `reviewed_at`      | `timestamptz` | Nullable    |

## Table `phases`

### Columns

| Name            | Type          | Constraints |
| --------------- | ------------- | ----------- |
| `phase_id`      | `text`        | Primary     |
| `title`         | `text`        |             |
| `description`   | `text`        | Nullable    |
| `image_url`     | `text`        | Nullable    |
| `is_active`     | `bool`        | Nullable    |
| `Module Time`   | `text`        | Nullable    |
| `Note`          | `text`        | Nullable    |
| `prerequisites` | `text`        | Nullable    |
| `will_learn`    | `text`        | Nullable    |
| `created_by`    | `text`        | Nullable    |
| `created_at`    | `timestamptz` | Nullable    |
| `track_id`      | `uuid`        | Nullable    |

## Table `courses`

### Columns

| Name             | Type          | Constraints |
| ---------------- | ------------- | ----------- |
| `course_id`      | `text`        | Primary     |
| `phase_id`       | `text`        | Nullable    |
| `title`          | `text`        |             |
| `description`    | `text`        | Nullable    |
| `playlist_id`    | `text`        | Nullable    |
| `image_url`      | `text`        | Nullable    |
| `prerequisites`  | `jsonb`       | Nullable    |
| `tools_required` | `jsonb`       | Nullable    |
| `is_active`      | `bool`        | Nullable    |
| `created_at`     | `timestamptz` | Nullable    |
| `auto_sync`      | `bool`        | Nullable    |
| `type`           | `text`        | Nullable    |
| `related_with`   | `text`        | Nullable    |
| `Module_Time`    | `text`        | Nullable    |
| `Note`           | `text`        | Nullable    |
| `will_learn`     | `text`        | Nullable    |
| `created_by`     | `text`        | Nullable    |

## Table `course_materials`

### Columns

| Name             | Type          | Constraints |
| ---------------- | ------------- | ----------- |
| `content_id`     | `text`        | Primary     |
| `course_id`      | `text`        | Nullable    |
| `title`          | `text`        |             |
| `type`           | `text`        |             |
| `video_id`       | `text`        | Nullable    |
| `duration`       | `int4`        | Nullable    |
| `order_index`    | `int4`        | Nullable    |
| `base_xp`        | `int4`        | Nullable    |
| `ref_quiz_id`    | `uuid`        | Nullable    |
| `ref_project_id` | `uuid`        | Nullable    |
| `Author`         | `text`        | Nullable    |
| `Link Title`     | `text`        | Nullable    |
| `Note`           | `text`        | Nullable    |
| `status`         | `bool`        | Nullable    |
| `created_by`     | `text`        | Nullable    |
| `created_at`     | `timestamptz` | Nullable    |

## Table `quizzes`

### Columns

| Name                | Type          | Constraints |
| ------------------- | ------------- | ----------- |
| `quiz_id`           | `uuid`        | Primary     |
| `title`             | `text`        |             |
| `description`       | `text`        | Nullable    |
| `passing_score`     | `int4`        | Nullable    |
| `max_xp`            | `int4`        | Nullable    |
| `attempts_allowed`  | `int4`        | Nullable    |
| `created_at`        | `timestamptz` | Nullable    |
| `created_by`        | `text`        | Nullable    |
| `questions_to_show` | `int2`        | Nullable    |

## Table `quiz_questions`

### Columns

| Name             | Type          | Constraints |
| ---------------- | ------------- | ----------- |
| `id`             | `uuid`        | Primary     |
| `quiz_id`        | `uuid`        | Nullable    |
| `question_text`  | `text`        |             |
| `option_a`       | `text`        |             |
| `option_b`       | `text`        |             |
| `option_c`       | `text`        | Nullable    |
| `option_d`       | `text`        | Nullable    |
| `correct_answer` | `bpchar`      |             |
| `hint`           | `text`        | Nullable    |
| `created_by`     | `text`        | Nullable    |
| `created_at`     | `timestamptz` | Nullable    |

## Table `projects`

### Columns

| Name                | Type          | Constraints |
| ------------------- | ------------- | ----------- |
| `id`                | `uuid`        | Primary     |
| `title`             | `text`        |             |
| `description`       | `text`        |             |
| `requirements_url`  | `text`        | Nullable    |
| `max_points`        | `int4`        | Nullable    |
| `rubric_json`       | `jsonb`       | Nullable    |
| `created_at`        | `timestamptz` | Nullable    |
| `created_by`        | `text`        | Nullable    |
| `submission_method` | `text`        | Nullable    |

## Table `enrollments`

### Columns

| Name               | Type          | Constraints |
| ------------------ | ------------- | ----------- |
| `id`               | `uuid`        | Primary     |
| `user_id`          | `uuid`        |             |
| `course_id`        | `text`        |             |
| `progress_percent` | `int4`        | Nullable    |
| `is_completed`     | `bool`        | Nullable    |
| `started_at`       | `timestamptz` | Nullable    |
| `last_accessed_at` | `timestamptz` | Nullable    |

## Table `completed_materials`

### Columns

| Name           | Type          | Constraints |
| -------------- | ------------- | ----------- |
| `id`           | `uuid`        | Primary     |
| `user_id`      | `uuid`        |             |
| `material_id`  | `text`        |             |
| `course_id`    | `text`        | Nullable    |
| `completed_at` | `timestamptz` | Nullable    |

## Table `quiz_attempts`

### Columns

| Name             | Type          | Constraints |
| ---------------- | ------------- | ----------- |
| `id`             | `uuid`        | Primary     |
| `user_id`        | `uuid`        |             |
| `quiz_id`        | `uuid`        |             |
| `score`          | `int4`        |             |
| `passed`         | `bool`        | Nullable    |
| `attempt_number` | `int4`        | Nullable    |
| `submitted_at`   | `timestamptz` | Nullable    |
| `answers`        | `jsonb`       | Nullable    |

## Table `project_submissions`

### Columns

| Name              | Type          | Constraints |
| ----------------- | ------------- | ----------- |
| `id`              | `uuid`        | Primary     |
| `user_id`         | `uuid`        |             |
| `project_id`      | `uuid`        |             |
| `submission_link` | `text`        |             |
| `status`          | `text`        | Nullable    |
| `grade`           | `int4`        | Nullable    |
| `feedback_text`   | `text`        | Nullable    |
| `submitted_at`    | `timestamptz` | Nullable    |
| `graded_at`       | `timestamptz` | Nullable    |
| `rubric_scores`   | `jsonb`       | Nullable    |
| `graded_by`       | `uuid`        | Nullable    |
| `graded_by_name`  | `text`        | Nullable    |

## Table `student_xp_logs`

### Columns

| Name         | Type          | Constraints |
| ------------ | ------------- | ----------- |
| `id`         | `uuid`        | Primary     |
| `user_id`    | `uuid`        |             |
| `amount`     | `int4`        |             |
| `reason`     | `text`        |             |
| `source_id`  | `text`        | Nullable    |
| `created_at` | `timestamptz` | Nullable    |

## Table `team_score_logs`

### Columns

| Name             | Type          | Constraints |
| ---------------- | ------------- | ----------- |
| `id`             | `uuid`        | Primary     |
| `team_id`        | `uuid`        |             |
| `contributor_id` | `uuid`        | Nullable    |
| `amount`         | `int4`        |             |
| `reason`         | `text`        | Nullable    |
| `created_at`     | `timestamptz` | Nullable    |

## Table `experts`

### Columns

| Name           | Type   | Constraints |
| -------------- | ------ | ----------- |
| `id`           | `uuid` | Primary     |
| `name`         | `text` | Nullable    |
| `role`         | `text` | Nullable    |
| `image_url`    | `text` | Nullable    |
| `linkedin_url` | `text` | Nullable    |

## Table `tools`

### Columns

| Name          | Type   | Constraints |
| ------------- | ------ | ----------- |
| `id`          | `uuid` | Primary     |
| `name`        | `text` | Nullable    |
| `description` | `text` | Nullable    |
| `link_url`    | `text` | Nullable    |
| `icon_url`    | `text` | Nullable    |

## Table `roadmap_steps`

### Columns

| Name          | Type   | Constraints |
| ------------- | ------ | ----------- |
| `id`          | `uuid` | Primary     |
| `title`       | `text` | Nullable    |
| `description` | `text` | Nullable    |
| `step_number` | `int4` | Nullable    |
| `status`      | `text` | Nullable    |

## Table `team_invitations`

### Columns

| Name             | Type          | Constraints |
| ---------------- | ------------- | ----------- |
| `id`             | `uuid`        | Primary     |
| `to_uid`         | `uuid`        | Nullable    |
| `to_email`       | `text`        |             |
| `to_name`        | `text`        | Nullable    |
| `from_team_id`   | `uuid`        |             |
| `from_leader_id` | `uuid`        |             |
| `status`         | `text`        | Nullable    |
| `team_snapshot`  | `jsonb`       | Nullable    |
| `created_at`     | `timestamptz` | Nullable    |

## Table `team_tasks`

### Columns

| Name          | Type          | Constraints |
| ------------- | ------------- | ----------- |
| `id`          | `uuid`        | Primary     |
| `team_id`     | `uuid`        |             |
| `content_id`  | `text`        | Nullable    |
| `course_id`   | `text`        | Nullable    |
| `title`       | `text`        | Nullable    |
| `description` | `text`        | Nullable    |
| `duration`    | `text`        | Nullable    |
| `type`        | `text`        |             |
| `week_id`     | `text`        |             |
| `due_date`    | `timestamptz` | Nullable    |
| `assigned_by` | `uuid`        | Nullable    |
| `stats`       | `jsonb`       | Nullable    |
| `created_at`  | `timestamptz` | Nullable    |

## Table `team_posts`

### Columns

| Name             | Type          | Constraints |
| ---------------- | ------------- | ----------- |
| `id`             | `uuid`        | Primary     |
| `team_id`        | `uuid`        |             |
| `type`           | `text`        |             |
| `title`          | `text`        |             |
| `content`        | `text`        |             |
| `creator_id`     | `uuid`        | Nullable    |
| `creator_name`   | `text`        | Nullable    |
| `creator_avatar` | `text`        | Nullable    |
| `seen_by`        | `jsonb`       | Nullable    |
| `created_at`     | `timestamptz` | Nullable    |
| `is_pinned`      | `bool`        | Nullable    |
| `expiry_date`    | `date`        | Nullable    |
| `link_url`       | `text`        | Nullable    |
| `target_members` | `jsonb`       | Nullable    |

## Table `active_quiz_states`

### Columns

| Name              | Type          | Constraints |
| ----------------- | ------------- | ----------- |
| `id`              | `uuid`        | Primary     |
| `user_id`         | `uuid`        |             |
| `quiz_id`         | `uuid`        |             |
| `questions`       | `jsonb`       |             |
| `user_answers`    | `jsonb`       |             |
| `current_attempt` | `int4`        |             |
| `updated_at`      | `timestamptz` | Nullable    |

## Table `system_notifications`

### Columns

| Name               | Type          | Constraints |
| ------------------ | ------------- | ----------- |
| `id`               | `uuid`        | Primary     |
| `title`            | `text`        |             |
| `content`          | `text`        |             |
| `type`             | `text`        | Nullable    |
| `target_team_id`   | `uuid`        | Nullable    |
| `target_leader_id` | `uuid`        | Nullable    |
| `is_read`          | `bool`        | Nullable    |
| `created_at`       | `timestamptz` | Nullable    |
| `seen_by`          | `jsonb`       | Nullable    |

## Table `tracks`

### Columns

| Name          | Type          | Constraints |
| ------------- | ------------- | ----------- |
| `id`          | `uuid`        | Primary     |
| `name`        | `text`        |             |
| `description` | `text`        | Nullable    |
| `is_active`   | `bool`        | Nullable    |
| `created_at`  | `timestamptz` | Nullable    |

## Table `admin_applications`

### Columns

| Name                   | Type          | Constraints |
| ---------------------- | ------------- | ----------- |
| `id`                   | `uuid`        | Primary     |
| `full_name`            | `text`        |             |
| `email`                | `text`        |             |
| `phone`                | `text`        | Nullable    |
| `gender`               | `text`        | Nullable    |
| `age`                  | `int4`        | Nullable    |
| `university`           | `text`        |             |
| `faculty`              | `text`        | Nullable    |
| `department`           | `text`        | Nullable    |
| `academic_year`        | `text`        | Nullable    |
| `status`               | `text`        | Nullable    |
| `hours_per_week`       | `text`        |             |
| `available_days`       | `jsonb`       | Nullable    |
| `preferred_time`       | `text`        | Nullable    |
| `ic_interest_level`    | `text`        | Nullable    |
| `technical_background` | `jsonb`       | Nullable    |
| `motivation_text`      | `text`        | Nullable    |
| `contribution_text`    | `text`        | Nullable    |
| `experience_text`      | `text`        | Nullable    |
| `linkedin`             | `text`        | Nullable    |
| `github`               | `text`        | Nullable    |
| `portfolio`            | `text`        | Nullable    |
| `track`                | `text`        | Nullable    |
| `application_status`   | `text`        | Nullable    |
| `internal_notes`       | `text`        | Nullable    |
| `submitted_at`         | `timestamptz` | Nullable    |
| `reviewed_by`          | `uuid`        | Nullable    |
| `reviewed_at`          | `timestamptz` | Nullable    |
| `governorate`          | `text`        | Nullable    |
| `academic_track`       | `text`        | Nullable    |
