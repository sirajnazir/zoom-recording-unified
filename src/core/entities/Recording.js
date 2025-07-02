/**
 * Recording entity representing a Zoom recording
 */
class Recording {
    constructor({
        id,
        uuid,
        meetingId,
        topic,
        startTime,
        duration,
        participants = [],
        recordingFiles = [],
        hostEmail,
        downloadToken,
        password
    }) {
        this.id = id;
        this.uuid = uuid;
        this.meetingId = meetingId;
        this.topic = topic;
        this.startTime = new Date(startTime);
        this.duration = duration;
        this.participants = participants;
        this.recordingFiles = recordingFiles;
        this.hostEmail = hostEmail;
        this.downloadToken = downloadToken;
        this.password = password;
        
        this._validate();
    }

    _validate() {
        if (!this.id) throw new Error('Recording ID is required');
        if (!this.uuid) throw new Error('Recording UUID is required');
        if (!this.meetingId) throw new Error('Meeting ID is required');
        if (!this.topic) throw new Error('Topic is required');
        if (!this.startTime) throw new Error('Start time is required');
        if (typeof this.duration !== 'number' || this.duration < 0) {
            throw new Error('Duration must be a positive number');
        }
    }

    get uniqueKey() {
        return `${this.id}_${this.uuid}`;
    }

    get endTime() {
        return new Date(this.startTime.getTime() + (this.duration * 60000));
    }

    getFileByType(type) {
        return this.recordingFiles.find(file => file.recordingType === type);
    }

    hasTranscript() {
        return this.recordingFiles.some(file => 
            file.recordingType === 'transcript' || file.fileExtension === 'vtt'
        );
    }

    isShortDuration() {
        return this.duration < 5;
    }

    toJSON() {
        return {
            id: this.id,
            uuid: this.uuid,
            meetingId: this.meetingId,
            topic: this.topic,
            startTime: this.startTime.toISOString(),
            duration: this.duration,
            participants: this.participants,
            recordingFiles: this.recordingFiles,
            hostEmail: this.hostEmail,
            hasTranscript: this.hasTranscript(),
            isShortDuration: this.isShortDuration()
        };
    }
}

module.exports = { Recording }; 