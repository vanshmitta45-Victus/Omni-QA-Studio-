package com.omniqa.studio.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NoteRequest {
    private String title;
    private String content; // Markdown text
    private Boolean isShared;

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public Boolean getIsShared() {
        return isShared != null && isShared;
    }

    public void setIsShared(Boolean shared) {
        isShared = shared;
    }
}
