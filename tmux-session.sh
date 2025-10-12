#!/bin/bash
# scripts/tmux-session.sh - Helper script for tmux session management

# Create a new tmux session for daemon work
create_daemon_session() {
    local session_name=${1:-"daemon"}
    local workspace_dir="$(pwd)"
    
    # Source workspace tmux config if it exists
    local tmux_config=""
    if [ -f "$workspace_dir/.tmux.conf" ]; then
        tmux_config="-f $workspace_dir/.tmux.conf"
        echo "Using workspace tmux config: $workspace_dir/.tmux.conf"
    fi
    
    # Create new session with main daemon watch
    tmux $tmux_config new-session -d -s "$session_name" -c "$workspace_dir" -n "main" "d watch"
    
    # Create additional windows for different functions
    tmux $tmux_config new-window -t "$session_name" -n "manual" -c "$workspace_dir" "bash"
    tmux $tmux_config new-window -t "$session_name" -n "logs" -c "$workspace_dir" "tail -f tmp/watch.log"
    
    # Select the main window
    tmux $tmux_config select-window -t "$session_name:main"
    
    echo "Created tmux session '$session_name' with daemon setup"
    echo "Attach with: tmux attach -t $session_name"
}

# Auto-create panes for all pending sessions
watch_all_sessions() {
    local sessions=$(d sessions --format csv | tail -n +2 | grep ",pending," | cut -d',' -f1)
    
    for session_id in $sessions; do
        echo "Creating watch pane for session $session_id"
        tmux split-window -c "$(pwd)" "d watch $session_id" \; select-pane -T "watch-$session_id"
    done
}

# Kill all watch panes (cleanup)
cleanup_watch_panes() {
    tmux list-panes -a -F '#{pane_title} #{session_name}:#{window_index}.#{pane_index}' | \
    grep '^watch-' | \
    while read title pane; do
        echo "Killing pane: $title ($pane)"
        tmux kill-pane -t "$pane"
    done
}

case "$1" in
    "create")
        create_daemon_session "$2"
        ;;
    "watch-all")
        watch_all_sessions
        ;;
    "cleanup")
        cleanup_watch_panes
        ;;
    *)
        echo "Usage: $0 {create|watch-all|cleanup} [session_name]"
        echo "  create [name]  - Create new tmux session for daemon work"
        echo "  watch-all      - Create watch panes for all pending sessions"  
        echo "  cleanup        - Kill all watch panes"
        exit 1
        ;;
esac